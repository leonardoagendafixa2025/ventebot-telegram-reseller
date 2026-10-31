-- Migration: 20261031_init_schema.sql
-- Descrição: Esquema inicial para Bot de Revenda Telegram + VenteBot Reseller API + Painel Admin
-- Criação atômica, idempotente e segura com RLS e funções RPC transacionais.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. ROLES E AUTORIZAÇÃO ADMINISTRATIVA
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'superadmin', 'support')),
    criado_por UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_user_roles_user UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

-- Função helper para verificar se o usuário autenticado é admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'superadmin')
    );
$$;

-- ==============================================================================
-- 2. CATEGORIAS DE PRODUTOS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.categorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    emoji TEXT,
    ordem INTEGER NOT NULL DEFAULT 0,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_categorias_ordem ON public.categorias(ordem ASC, ativo);

-- ==============================================================================
-- 3. PRODUTOS DO CATÁLOGO (VENTEBOT E PRÓPRIOS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.produtos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origem TEXT NOT NULL DEFAULT 'ventebot' CHECK (origem IN ('ventebot', 'proprio')),
    fornecedor_produto_id BIGINT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
    emoji TEXT,
    imagem_url TEXT,
    custo_usd NUMERIC(12, 4) NOT NULL DEFAULT 0,
    preco_venda_usd NUMERIC(12, 4) NOT NULL DEFAULT 0,
    preco_venda_stars INTEGER NOT NULL DEFAULT 1 CHECK (preco_venda_stars >= 1),
    margem_lucro_usd NUMERIC(12, 4) GENERATED ALWAYS AS (preco_venda_usd - custo_usd) STORED,
    tipo_entrega TEXT NOT NULL CHECK (tipo_entrega IN ('stock', 'activation', 'supplier_api', 'api_test', 'arquivo_proprio', 'texto_proprio')),
    garantia_dias INTEGER NOT NULL DEFAULT 30,
    estoque_consultavel BOOLEAN NOT NULL DEFAULT false,
    estoque_qtd INTEGER NULL, -- null = on-demand / ilimitado
    ativo BOOLEAN NOT NULL DEFAULT true,
    destaque BOOLEAN NOT NULL DEFAULT false,
    ultima_sincronizacao TIMESTAMPTZ NULL,
    dados_fornecedor JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_produto_fornecedor UNIQUE (fornecedor_produto_id)
);

CREATE INDEX IF NOT EXISTS idx_produtos_ativo ON public.produtos(ativo, destaque);
CREATE INDEX IF NOT EXISTS idx_produtos_fornecedor_id ON public.produtos(fornecedor_produto_id);
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON public.produtos(categoria_id);

-- ==============================================================================
-- 4. PLANOS / TIERS DE PRODUTO
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.planos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    min_qty INTEGER NOT NULL DEFAULT 1 CHECK (min_qty >= 1),
    max_qty INTEGER NULL,
    preco_usd NUMERIC(12, 4) NOT NULL,
    preco_stars INTEGER NOT NULL CHECK (preco_stars >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_planos_produto ON public.planos(produto_id);

-- ==============================================================================
-- 5. ITENS DE ESTOQUE PRÓPRIO
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.estoque_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    conteudo TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'disponivel' CHECK (status IN ('disponivel', 'reservado', 'entregue')),
    pedido_id UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    entregue_em TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_estoque_produto_status ON public.estoque_itens(produto_id, status);

-- ==============================================================================
-- 6. CLIENTES TELEGRAM
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT NOT NULL UNIQUE,
    username TEXT NULL,
    first_name TEXT NULL,
    last_name TEXT NULL,
    idioma TEXT NOT NULL DEFAULT 'pt',
    bloqueado BOOLEAN NOT NULL DEFAULT false,
    saldo_carteira_stars INTEGER NOT NULL DEFAULT 0 CHECK (saldo_carteira_stars >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_clientes_telegram_id ON public.clientes(telegram_id);

-- ==============================================================================
-- 7. PEDIDOS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pedidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_pedido BIGSERIAL UNIQUE,
    referencia_unica TEXT NOT NULL UNIQUE,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
    produto_id UUID NULL REFERENCES public.produtos(id) ON DELETE SET NULL,
    plano_id UUID NULL REFERENCES public.planos(id) ON DELETE SET NULL,
    quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade >= 1),
    preco_unitario_usd NUMERIC(12, 4) NOT NULL,
    custo_unitario_usd NUMERIC(12, 4) NOT NULL,
    total_usd NUMERIC(12, 4) NOT NULL,
    total_stars INTEGER NOT NULL CHECK (total_stars >= 1),
    margem_total_usd NUMERIC(12, 4) NOT NULL,
    metodo_pagamento TEXT NOT NULL DEFAULT 'telegram_stars' CHECK (metodo_pagamento IN ('telegram_stars', 'carteira_interna', 'teste_admin')),
    status_pagamento TEXT NOT NULL DEFAULT 'pendente' CHECK (status_pagamento IN ('pendente', 'pago', 'falhou', 'reembolsado', 'cancelado')),
    status_fornecedor TEXT NOT NULL DEFAULT 'nao_iniciado' CHECK (status_fornecedor IN ('nao_iniciado', 'COMPLETED', 'PAID_PENDING_DELIVERY', 'AWAITING_ACTIVATION_INFO', 'AWAITING_ACTIVATION', 'CANCELLED', 'fornecedor_erro', 'fornecedor_status_desconhecido')),
    status_entrega TEXT NOT NULL DEFAULT 'pendente' CHECK (status_entrega IN ('pendente', 'entregue', 'falha_entrega', 'cancelada')),
    fornecedor_order_id BIGINT NULL,
    fornecedor_order_number BIGINT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    activation_identifier TEXT NULL,
    conteudo_entregue TEXT NULL,
    itens_entregues JSONB NULL,
    detalhes_falha TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON public.pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_status_pagamento ON public.pedidos(status_pagamento);
CREATE INDEX IF NOT EXISTS idx_pedidos_status_fornecedor ON public.pedidos(status_fornecedor);
CREATE INDEX IF NOT EXISTS idx_pedidos_fornecedor_order_id ON public.pedidos(fornecedor_order_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_idempotency_key ON public.pedidos(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_pedidos_referencia ON public.pedidos(referencia_unica);

-- ==============================================================================
-- 8. PAGAMENTOS REGISTRADOS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pagamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    provedor TEXT NOT NULL DEFAULT 'telegram_stars',
    referencia_externa TEXT NOT NULL UNIQUE, -- telegram_payment_charge_id
    valor_stars INTEGER NOT NULL,
    valor_usd NUMERIC(12, 4) NULL,
    status TEXT NOT NULL DEFAULT 'confirmado' CHECK (status IN ('pendente', 'confirmado', 'rejeitado', 'reembolsado')),
    payload_seguro JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    confirmado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_pedido ON public.pagamentos(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_referencia_externa ON public.pagamentos(referencia_externa);

-- ==============================================================================
-- 9. LIVRO-RAZÃO: TRANSAÇÕES DE CARTEIRA DO CLIENTE (IMUTÁVEL)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.transacoes_carteira (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
    tipo TEXT NOT NULL CHECK (tipo IN ('credito', 'debito', 'estorno')),
    valor_stars INTEGER NOT NULL CHECK (valor_stars > 0),
    saldo_anterior INTEGER NOT NULL,
    saldo_posterior INTEGER NOT NULL,
    descricao TEXT NOT NULL,
    pedido_id UUID NULL REFERENCES public.pedidos(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_transacoes_carteira_cliente ON public.transacoes_carteira(cliente_id, created_at DESC);

-- ==============================================================================
-- 10. EVENTOS / LOGS DE INTEGRAÇÃO COM O FORNECEDOR (VENTEBOT)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.fornecedor_eventos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id UUID NULL REFERENCES public.pedidos(id) ON DELETE SET NULL,
    acao TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    payload_sanitizado JSONB NULL,
    resposta_sanitizada JSONB NULL,
    status_http INTEGER NULL,
    sucesso BOOLEAN NOT NULL,
    mensagem_erro TEXT NULL,
    tempo_execucao_ms INTEGER NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_fornecedor_eventos_pedido ON public.fornecedor_eventos(pedido_id);
CREATE INDEX IF NOT EXISTS idx_fornecedor_eventos_created_at ON public.fornecedor_eventos(created_at DESC);

-- ==============================================================================
-- 11. CONFIGURAÇÕES GERAIS DO SISTEMA (NÃO SECRETAS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.configuracoes (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    descricao TEXT NULL,
    tipo TEXT NOT NULL DEFAULT 'string' CHECK (tipo IN ('string', 'number', 'boolean', 'json')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 12. PUBLICAÇÕES NO CANAL PÚBLICO DO TELEGRAM
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.publicacoes_canal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo TEXT NOT NULL CHECK (tipo IN ('oferta', 'venda', 'restock')),
    produto_id UUID NULL REFERENCES public.produtos(id) ON DELETE SET NULL,
    pedido_id UUID NULL REFERENCES public.pedidos(id) ON DELETE SET NULL,
    mensagem_telegram_id BIGINT NULL,
    conteudo_publicado TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'publicado' CHECK (status IN ('publicado', 'erro')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 13. AUDITORIA DE AÇÕES DO PAINEL ADMINISTRATIVO
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.logs_auditoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    acao TEXT NOT NULL,
    entidade TEXT NOT NULL,
    entidade_id TEXT NULL,
    detalhes JSONB NULL,
    ip_address TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_logs_auditoria_created ON public.logs_auditoria(created_at DESC);

-- ==============================================================================
-- 14. POLÍTICAS ROW LEVEL SECURITY (RLS) - PRINCÍPIO DO MENOR PRIVILÉGIO
-- ==============================================================================
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transacoes_carteira ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedor_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publicacoes_canal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_auditoria ENABLE ROW LEVEL SECURITY;

-- Categorias e Produtos: Leitura pública para itens ativos
CREATE POLICY "Leitura pública de categorias ativas"
    ON public.categorias FOR SELECT
    USING (ativo = true);

CREATE POLICY "Admin gerencia categorias"
    ON public.categorias FOR ALL
    USING (public.is_admin());

CREATE POLICY "Leitura pública de produtos ativos"
    ON public.produtos FOR SELECT
    USING (ativo = true);

CREATE POLICY "Admin gerencia produtos"
    ON public.produtos FOR ALL
    USING (public.is_admin());

CREATE POLICY "Leitura pública de planos de produtos ativos"
    ON public.planos FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.produtos WHERE id = planos.produto_id AND ativo = true));

CREATE POLICY "Admin gerencia planos"
    ON public.planos FOR ALL
    USING (public.is_admin());

-- Configurações: Apenas Admin pode ler e modificar
CREATE POLICY "Admin visualiza e altera configuracoes"
    ON public.configuracoes FOR ALL
    USING (public.is_admin());

-- Demais tabelas administrativas / sensíveis: Apenas Admin tem acesso via cliente
CREATE POLICY "Admin gerencia user_roles"
    ON public.user_roles FOR ALL
    USING (public.is_admin());

CREATE POLICY "Admin gerencia estoque_itens"
    ON public.estoque_itens FOR ALL
    USING (public.is_admin());

CREATE POLICY "Admin visualiza clientes"
    ON public.clientes FOR ALL
    USING (public.is_admin());

CREATE POLICY "Admin visualiza e gerencia pedidos"
    ON public.pedidos FOR ALL
    USING (public.is_admin());

CREATE POLICY "Admin visualiza pagamentos"
    ON public.pagamentos FOR ALL
    USING (public.is_admin());

CREATE POLICY "Admin visualiza transacoes_carteira"
    ON public.transacoes_carteira FOR ALL
    USING (public.is_admin());

CREATE POLICY "Admin visualiza fornecedor_eventos"
    ON public.fornecedor_eventos FOR ALL
    USING (public.is_admin());

CREATE POLICY "Admin gerencia publicacoes_canal"
    ON public.publicacoes_canal FOR ALL
    USING (public.is_admin());

CREATE POLICY "Admin visualiza logs_auditoria"
    ON public.logs_auditoria FOR ALL
    USING (public.is_admin());

-- ==============================================================================
-- 15. FUNÇÕES TRANSACIONAIS SEGURAS (RPCs)
-- ==============================================================================

-- 15.1 Função de Bootstrap Seguro para o Primeiro Admin
CREATE OR REPLACE FUNCTION public.bootstrap_primeiro_admin(
    p_user_id UUID,
    p_bootstrap_secret TEXT,
    p_server_bootstrap_secret TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_count INTEGER;
BEGIN
    -- Validar se os parâmetros são seguros
    IF p_bootstrap_secret IS NULL OR p_server_bootstrap_secret IS NULL OR p_bootstrap_secret <> p_server_bootstrap_secret THEN
        RETURN jsonb_build_object('success', false, 'message', 'Chave secreta de bootstrap inválida.');
    END IF;

    -- Verificar quantos admins existem atualmente
    SELECT COUNT(*) INTO v_admin_count FROM public.user_roles WHERE role IN ('admin', 'superadmin');
    
    -- Apenas permitir bootstrap se nenhum admin existir
    IF v_admin_count > 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'O sistema já possui administrador cadastrado.');
    END IF;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, 'superadmin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'superadmin';

    INSERT INTO public.logs_auditoria (usuario_id, acao, entidade, entidade_id, detalhes)
    VALUES (p_user_id, 'BOOTSTRAP_ADMIN', 'user_roles', p_user_id::text, jsonb_build_object('role', 'superadmin'));

    RETURN jsonb_build_object('success', true, 'message', 'Primeiro administrador configurado com sucesso.');
END;
$$;

-- 15.2 Função Atômica: Registrar Pedido com Preço Congelado
CREATE OR REPLACE FUNCTION public.criar_pedido_atomicamente(
    p_telegram_id BIGINT,
    p_username TEXT,
    p_first_name TEXT,
    p_produto_id UUID,
    p_quantidade INTEGER,
    p_metodo_pagamento TEXT,
    p_activation_identifier TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cliente_id UUID;
    v_produto RECORD;
    v_pedido_id UUID;
    v_ref_unica TEXT;
    v_idempotency_key TEXT;
    v_total_usd NUMERIC(12, 4);
    v_total_stars INTEGER;
    v_margem_usd NUMERIC(12, 4);
BEGIN
    IF p_quantidade < 1 OR p_quantidade > 10000 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Quantidade inválida.');
    END IF;

    -- Obter e travar o cliente ou criá-lo
    INSERT INTO public.clientes (telegram_id, username, first_name)
    VALUES (p_telegram_id, p_username, p_first_name)
    ON CONFLICT (telegram_id) DO UPDATE 
        SET username = EXCLUDED.username,
            first_name = EXCLUDED.first_name,
            updated_at = timezone('utc'::text, now())
    RETURNING id INTO v_cliente_id;

    -- Obter o produto ativo
    SELECT * INTO v_produto FROM public.produtos WHERE id = p_produto_id AND ativo = true;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Produto indisponível ou inativo.');
    END IF;

    -- Verificar estoque local se for próprio com controle
    IF v_produto.origem = 'proprio' AND v_produto.tipo_entrega = 'stock' THEN
        IF v_produto.estoque_qtd IS NOT NULL AND v_produto.estoque_qtd < p_quantidade THEN
            RETURN jsonb_build_object('success', false, 'message', 'Estoque local insuficiente.');
        END IF;
    END IF;

    v_total_usd := v_produto.preco_venda_usd * p_quantidade;
    v_total_stars := v_produto.preco_venda_stars * p_quantidade;
    v_margem_usd := (v_produto.preco_venda_usd - v_produto.custo_usd) * p_quantidade;

    v_ref_unica := 'ORD-' || TO_CHAR(timezone('utc'::text, now()), 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::text, 1, 8);
    v_idempotency_key := 'ventebot-' || v_ref_unica;

    INSERT INTO public.pedidos (
        referencia_unica,
        cliente_id,
        produto_id,
        quantidade,
        preco_unitario_usd,
        custo_unitario_usd,
        total_usd,
        total_stars,
        margem_total_usd,
        metodo_pagamento,
        status_pagamento,
        status_fornecedor,
        status_entrega,
        idempotency_key,
        activation_identifier
    ) VALUES (
        v_ref_unica,
        v_cliente_id,
        v_produto.id,
        p_quantidade,
        v_produto.preco_venda_usd,
        v_produto.custo_usd,
        v_total_usd,
        v_total_stars,
        v_margem_usd,
        p_metodo_pagamento,
        'pendente',
        'nao_iniciado',
        'pendente',
        v_idempotency_key,
        p_activation_identifier
    )
    RETURNING id INTO v_pedido_id;

    RETURN jsonb_build_object(
        'success', true,
        'pedido_id', v_pedido_id,
        'referencia_unica', v_ref_unica,
        'total_usd', v_total_usd,
        'total_stars', v_total_stars,
        'idempotency_key', v_idempotency_key,
        'produto_nome', v_produto.nome,
        'tipo_entrega', v_produto.tipo_entrega,
        'origem', v_produto.origem,
        'fornecedor_produto_id', v_produto.fornecedor_produto_id
    );
END;
$$;

-- 15.3 Função Atômica: Confirmar Pagamento com Idempotência Estrita
CREATE OR REPLACE FUNCTION public.confirmar_pagamento_atomicamente(
    p_pedido_id UUID,
    p_provedor TEXT,
    p_referencia_externa TEXT,
    p_valor_stars INTEGER,
    p_payload_seguro JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pedido RECORD;
    v_ja_pago BOOLEAN;
BEGIN
    -- Verificar se já existe pagamento com essa mesma referência externa
    IF EXISTS (SELECT 1 FROM public.pagamentos WHERE referencia_externa = p_referencia_externa) THEN
        RETURN jsonb_build_object('success', true, 'status', 'ja_processado', 'message', 'Transação externa já registrada.');
    END IF;

    -- Lock pessimista na linha do pedido
    SELECT * INTO v_pedido 
    FROM public.pedidos 
    WHERE id = p_pedido_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido não encontrado.');
    END IF;

    IF v_pedido.status_pagamento = 'pago' THEN
        RETURN jsonb_build_object('success', true, 'status', 'ja_pago', 'message', 'Pedido já constava como pago.');
    END IF;

    IF v_pedido.total_stars <> p_valor_stars THEN
        RETURN jsonb_build_object('success', false, 'message', 'Divergência de valor pago em Stars.');
    END IF;

    -- Registrar pagamento
    INSERT INTO public.pagamentos (
        pedido_id,
        provedor,
        referencia_externa,
        valor_stars,
        status,
        payload_seguro
    ) VALUES (
        p_pedido_id,
        p_provedor,
        p_referencia_externa,
        p_valor_stars,
        'confirmado',
        p_payload_seguro
    );

    -- Atualizar status do pedido para 'pago'
    UPDATE public.pedidos
    SET status_pagamento = 'pago',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_pedido_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'pago',
        'pedido_id', v_pedido.id,
        'referencia_unica', v_pedido.referencia_unica,
        'idempotency_key', v_pedido.idempotency_key,
        'produto_id', v_pedido.produto_id,
        'quantidade', v_pedido.quantidade,
        'activation_identifier', v_pedido.activation_identifier
    );
END;
$$;

-- 15.4 Função Atômica: Registrar Entrega Final
CREATE OR REPLACE FUNCTION public.registrar_entrega_atomicamente(
    p_pedido_id UUID,
    p_status_fornecedor TEXT,
    p_status_entrega TEXT,
    p_fornecedor_order_id BIGINT,
    p_fornecedor_order_number BIGINT,
    p_conteudo_entregue TEXT,
    p_itens_entregues JSONB,
    p_detalhes_falha TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.pedidos
    SET status_fornecedor = p_status_fornecedor,
        status_entrega = p_status_entrega,
        fornecedor_order_id = COALESCE(p_fornecedor_order_id, fornecedor_order_id),
        fornecedor_order_number = COALESCE(p_fornecedor_order_number, fornecedor_order_number),
        conteudo_entregue = COALESCE(p_conteudo_entregue, conteudo_entregue),
        itens_entregues = COALESCE(p_itens_entregues, itens_entregues),
        detalhes_falha = p_detalhes_falha,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_pedido_id;

    RETURN jsonb_build_object('success', true, 'pedido_id', p_pedido_id);
END;
$$;

-- 15.5 Função Atômica: Creditar / Debitar Carteira do Cliente
CREATE OR REPLACE FUNCTION public.movimentar_carteira_atomicamente(
    p_cliente_id UUID,
    p_tipo TEXT,
    p_valor_stars INTEGER,
    p_descricao TEXT,
    p_pedido_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cliente RECORD;
    v_saldo_anterior INTEGER;
    v_saldo_posterior INTEGER;
BEGIN
    IF p_valor_stars <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Valor deve ser positivo.');
    END IF;

    SELECT * INTO v_cliente FROM public.clientes WHERE id = p_cliente_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cliente não encontrado.');
    END IF;

    v_saldo_anterior := v_cliente.saldo_carteira_stars;

    IF p_tipo = 'debito' THEN
        IF v_saldo_anterior < p_valor_stars THEN
            RETURN jsonb_build_object('success', false, 'message', 'Saldo insuficiente na carteira.');
        END IF;
        v_saldo_posterior := v_saldo_anterior - p_valor_stars;
    ELSIF p_tipo IN ('credito', 'estorno') THEN
        v_saldo_posterior := v_saldo_anterior + p_valor_stars;
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Tipo de movimentação inválido.');
    END IF;

    UPDATE public.clientes
    SET saldo_carteira_stars = v_saldo_posterior,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_cliente_id;

    INSERT INTO public.transacoes_carteira (
        cliente_id,
        tipo,
        valor_stars,
        saldo_anterior,
        saldo_posterior,
        descricao,
        pedido_id
    ) VALUES (
        p_cliente_id,
        p_tipo,
        p_valor_stars,
        v_saldo_anterior,
        v_saldo_posterior,
        p_descricao,
        p_pedido_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'saldo_anterior', v_saldo_anterior,
        'saldo_posterior', v_saldo_posterior
    );
END;
$$;
