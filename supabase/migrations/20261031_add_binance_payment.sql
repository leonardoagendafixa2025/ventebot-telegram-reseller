-- Migração: Suporte a pagamentos via Binance ID e Binance Pay
-- Executada com sucesso no banco de dados Supabase

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_metodo_pagamento_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_metodo_pagamento_check 
  CHECK (metodo_pagamento IN ('binance_id', 'binance_pay', 'telegram_stars', 'carteira_interna', 'teste_admin'));

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_status_pagamento_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_status_pagamento_check 
  CHECK (status_pagamento IN ('pendente', 'aguardando_confirmacao', 'pago', 'falhou', 'reembolsado', 'cancelado'));

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_total_stars_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_total_stars_check 
  CHECK (total_stars >= 0);

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS binance_tx_id TEXT NULL;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS comprovante_texto TEXT NULL;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS comprovante_foto_id TEXT NULL;

CREATE OR REPLACE FUNCTION public.criar_pedido_atomicamente(
    p_cliente_telegram_id BIGINT,
    p_cliente_username TEXT,
    p_cliente_first_name TEXT,
    p_cliente_last_name TEXT,
    p_produto_id UUID,
    p_quantidade INTEGER DEFAULT 1,
    p_metodo_pagamento TEXT DEFAULT 'binance_id',
    p_activation_identifier TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cliente_id UUID;
    v_produto RECORD;
    v_pedido_id UUID;
    v_ref_unica TEXT;
    v_total_usd NUMERIC(12, 4);
    v_total_stars INTEGER;
    v_margem_usd NUMERIC(12, 4);
    v_idempotency_key TEXT;
BEGIN
    INSERT INTO public.clientes (telegram_id, username, first_name, last_name)
    VALUES (p_cliente_telegram_id, p_cliente_username, p_cliente_first_name, p_cliente_last_name)
    ON CONFLICT (telegram_id) DO UPDATE
        SET username = COALESCE(EXCLUDED.username, clientes.username),
            first_name = COALESCE(EXCLUDED.first_name, clientes.first_name),
            last_name = COALESCE(EXCLUDED.last_name, clientes.last_name),
            updated_at = timezone('utc'::text, now())
    RETURNING id INTO v_cliente_id;

    SELECT * INTO v_produto FROM public.produtos WHERE id = p_produto_id AND ativo = true;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Produto indisponível ou inativo.');
    END IF;

    IF v_produto.origem = 'proprio' AND v_produto.tipo_entrega = 'stock' THEN
        IF v_produto.estoque_qtd IS NOT NULL AND v_produto.estoque_qtd < p_quantidade THEN
            RETURN jsonb_build_object('success', false, 'message', 'Estoque local insuficiente.');
        END IF;
    END IF;

    v_total_usd := v_produto.preco_venda_usd * p_quantidade;
    v_total_stars := COALESCE(v_produto.preco_venda_stars, 0) * p_quantidade;
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

CREATE OR REPLACE FUNCTION public.confirmar_pagamento_atomicamente(
    p_pedido_id UUID,
    p_provedor TEXT,
    p_referencia_externa TEXT,
    p_valor_stars INTEGER DEFAULT 0,
    p_payload_seguro JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pedido RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM public.pagamentos WHERE referencia_externa = p_referencia_externa) THEN
        RETURN jsonb_build_object('success', true, 'status', 'ja_processado', 'message', 'Transação externa já registrada.');
    END IF;

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

    IF p_provedor = 'telegram_stars' THEN
        IF v_pedido.total_stars <> p_valor_stars THEN
            RETURN jsonb_build_object('success', false, 'message', 'Divergência de valor pago em Stars.');
        END IF;
    END IF;

    INSERT INTO public.pagamentos (
        pedido_id,
        provedor,
        referencia_externa,
        valor_stars,
        valor_usd,
        status,
        payload_seguro
    ) VALUES (
        p_pedido_id,
        p_provedor,
        p_referencia_externa,
        COALESCE(p_valor_stars, 0),
        v_pedido.total_usd,
        'confirmado',
        p_payload_seguro
    );

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

INSERT INTO public.configuracoes (chave, valor, descricao, tipo)
VALUES 
  ('binance_id', '', 'ID de Usuário ou Pay ID da conta Binance do lojista', 'string'),
  ('binance_nome_titular', 'VenteDigital Oficial', 'Nome do titular exibido na Binance', 'string'),
  ('binance_moeda', 'USDT', 'Moeda principal para recebimento (USDT)', 'string')
ON CONFLICT (chave) DO NOTHING;
