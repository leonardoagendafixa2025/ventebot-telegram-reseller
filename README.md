# 🤖 VenteBot Telegram Reseller & Painel Administrativo

Sistema profissional e de ponta a ponta para revenda de produtos digitais no Telegram integrado diretamente com a **VenteBot Reseller API** oficial (`https://web-production-1c7b1.up.railway.app`) fornecida por `@storeBatmanBot`.

Desenvolvido com **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS**, **Supabase (PostgreSQL, Auth, RLS, Storage)** e **Telegram Bot API oficial** com pagamentos nativos em **Telegram Stars (XTR)**.

---

## 🚀 Arquitetura e Fluxo de Vendas

```
[ Cliente Telegram ]
       │
       ▼
[ Bot Webhook (/api/telegram/webhook) ]
       │
       ├── 1. Navegação no Catálogo (Categorias & Produtos)
       ├── 2. Criação Atômica de Pedido (Preço & Custo Congelados)
       ├── 3. Emissão de Fatura Oficial (sendInvoice - Telegram Stars)
       │
[ Telegram Stars Pagamento ] ──▶ Pre-Checkout Query Validado
       │
       ▼
[ Successful Payment Recebido ]
       │
       ├── 4. Lock Pessimista & Confirmação Idempotente no Banco
       ├── 5. Verificação de Saldo na VenteBot (GET /api/reseller/me)
       ├── 6. Compra via VenteBot API (POST /api/reseller/orders)
       │      • Header seguro: X-Reseller-Key (somente no servidor)
       │      • Idempotency-Key única por tentativa
       ├── 7. Entrega Imediata ao Cliente no Telegram (<pre>credenciais</pre>)
       └── 8. Publicação Opcional no Canal Público com Deep Link Seguro
```

---

## 📦 Funcionalidades Implementadas

### 1. Bot do Telegram (@seu_bot)
- **Menu e Comandos:** `/start`, `/products`, `/orders`, `/support` e teclado fixo persistente.
- **Catálogo Dinâmico:** Categorias e produtos atualizados em tempo real do banco de dados.
- **Deep Linking:** `/start prod_<id>` para redirecionamento direto de publicações do canal.
- **Pagamentos Policy-Compliant:** Cobrança nativa em **Telegram Stars (`XTR`)** via `sendInvoice`, `pre_checkout_query` e `successful_payment`.
- **Tratamento de Entrega:** Entrega instantânea de credenciais para produtos de estoque e acompanhamento de status para produtos em ativação.
- **Histórico de Compras:** Comando `/orders` com os últimos pedidos e dados entregues.

### 2. Painel Administrativo Privado
- **Dashboard Executivo:** Faturamento bruto em USD e Stars, custos de fornecedor, margem de lucro estimada e status dos pedidos.
- **Integração VenteBot:**
  - Botão de diagnóstico **"Testar Conexão com VenteBot"** (mede latência e saldo sem vazar a chave).
  - Sincronização automática do catálogo oficial (`POST /api/ventebot/sync`).
  - Reconciliação em lote de pedidos pendentes (`POST /api/orders/reconcile`).
- **Gerenciamento de Produtos:** Edição individual de preço de venda (USD e Stars), margem de lucro calculada e toggle ativo/pausado.
- **Gerenciamento de Categorias:** Criação e ordenação de categorias com emojis.
- **Gestão de Pedidos:** Acompanhamento de estados de pagamento, fornecedor e entrega com visualização de credenciais entregues.
- **Base de Clientes:** Monitoramento de clientes do Telegram e bloqueio de abusos.
- **Canal de Transmissão:** Disparo manual de ofertas e avisos de restock com deep link para o produto.
- **Auditoria & Logs:** Trilha de auditoria das requisições com a VenteBot API (sanitizadas contra vazamento de senhas ou tokens).

### 3. Segurança e Banco de Dados (Supabase)
- **Row Level Security (RLS):** Ativado em 100% das tabelas. Dados administrativos não podem ser acessados por usuários anônimos.
- **Funções Transacionais (RPCs):**
  - `criar_pedido_atomicamente`: Garante reserva e congelamento de preço.
  - `confirmar_pagamento_atomicamente`: Lock pessimista que impede compras ou entregas duplicadas.
  - `registrar_entrega_atomicamente`: Salva conteúdo entregue e atualiza status.
  - `bootstrap_primeiro_admin`: Permite cadastro seguro do primeiro superadmin apenas com a chave `ADMIN_BOOTSTRAP_SECRET`.
- **Proteção de Segredos:** A chave `VENTEBOT_RESELLER_KEY` reside exclusivamente no ambiente do servidor.

---

## 🛠️ Variáveis de Ambiente (.env.local)

Copie `.env.example` para `.env.local` e configure:

```env
# URL base da sua aplicação (ex: na Vercel)
APP_BASE_URL=https://meu-painel.vercel.app

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ey...
SUPABASE_SERVICE_ROLE_KEY=ey...

# Telegram Bot API
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
TELEGRAM_BOT_USERNAME=minha_loja_bot
TELEGRAM_WEBHOOK_SECRET=sua_chave_aleatoria_longa
TELEGRAM_PUBLIC_CHANNEL_ID=@canal_loja_ofertas

# VenteBot Reseller API Oficial
VENTEBOT_RESELLER_KEY=vb_reseller_sua_chave_aqui
VENTEBOT_BASE_URL=https://web-production-1c7b1.up.railway.app

# Bootstrap Admin
ADMIN_BOOTSTRAP_SECRET=sua_senha_secreta_de_bootstrap
```

---

## 📑 Configuração Inicial Passo a Passo

### 1. Banco de Dados (Supabase)
1. Crie um projeto no [Supabase](https://supabase.com).
2. Acesse o **SQL Editor** do Supabase.
3. Copie o conteúdo de `supabase/migrations/20261031_init_schema.sql` e execute. Todas as tabelas, índices, RLS e RPCs serão criadas.

### 2. Cadastro do Primeiro Administrador
1. Inicie a aplicação (`npm run dev`) ou faça o deploy na Vercel.
2. Acesse `/login`.
3. Clique em **"Primeiro acesso? Inicializar Primeiro Administrador"**.
4. Insira a sua `ADMIN_BOOTSTRAP_SECRET` configurada no ambiente, o seu email e senha.
5. Pronto! O primeiro superadministrador estará ativo e o cadastro público será imediatamente bloqueado.

### 3. Conexão com VenteBot
1. No painel, vá em **VenteBot API** (`/dashboard/integracoes/ventebot`).
2. Clique em **"Testar Conexão com VenteBot"** para verificar o saldo e latência.
3. Clique em **"Sincronizar Produtos Agora"** para importar os produtos oficiais do fornecedor.

### 4. Configuração do Bot do Telegram
1. Obtenha o token do bot com `@BotFather`.
2. Habilite pagamentos com Telegram Stars em seu bot no `@BotFather` (`/mybots` -> selecione o bot -> `Payments`).
3. No painel web, acesse **Configurações** (`/dashboard/configuracoes`) e clique em **"Configurar / Renovar Webhook Oficial"**.
4. O bot estará pronto para receber comandos e processar vendas automaticamente!

---

## 🧪 Testes Automatizados

O projeto conta com suíte de testes unitários e de integração cobrindo idempotência, isolamento, sanitização de logs e webhook:

```bash
npm test
```
