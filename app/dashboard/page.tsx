import { createClient } from "@/lib/supabase/server";
import {
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Users,
  AlertCircle,
  Package,
  ArrowUpRight,
  RefreshCw,
  Plug,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  // 1. Consultar métricas agregadas reais do banco de dados
  const { data: pedidosPagos } = await supabase
    .from("pedidos")
    .select("total_usd, custo_unitario_usd, quantidade, margem_total_usd, status_entrega, status_pagamento")
    .eq("status_pagamento", "pago");

  const receitaTotal = (pedidosPagos || []).reduce((acc, p) => acc + Number(p.total_usd), 0);
  const custoTotal = (pedidosPagos || []).reduce(
    (acc, p) => acc + Number(p.custo_unitario_usd) * p.quantidade,
    0
  );
  const margemTotal = (pedidosPagos || []).reduce(
    (acc, p) => acc + Number(p.margem_total_usd),
    0
  );

  const { count: totalPedidos } = await supabase
    .from("pedidos")
    .select("*", { count: "exact", head: true });

  const { count: pedidosPendentes } = await supabase
    .from("pedidos")
    .select("*", { count: "exact", head: true })
    .eq("status_pagamento", "pago")
    .eq("status_entrega", "pendente");

  const { count: totalClientes } = await supabase
    .from("clientes")
    .select("*", { count: "exact", head: true });

  const { count: totalProdutosAtivos } = await supabase
    .from("produtos")
    .select("*", { count: "exact", head: true })
    .eq("ativo", true);

  // 2. Últimos 6 pedidos
  const { data: ultimosPedidos } = await supabase
    .from("pedidos")
    .select(`
      id,
      numero_pedido,
      referencia_unica,
      total_usd,
      total_stars,
      status_pagamento,
      status_fornecedor,
      status_entrega,
      created_at,
      produto:produtos(nome, emoji),
      cliente:clientes(username, telegram_id)
    `)
    .order("created_at", { ascending: false })
    .limit(6);

  // 3. Status de configuração da VenteBot
  const ventebotConfigurada = Boolean(process.env.VENTEBOT_RESELLER_KEY);

  return (
    <div className="space-y-8">
      {/* Top Banner / Boas-vindas */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Visão Geral das Vendas
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Métricas de desempenho, faturamento em tempo real e status da revenda.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/integracoes/ventebot"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-violet-600/10 text-violet-300 border border-violet-500/20 hover:bg-violet-600/20 transition-all"
          >
            <Plug className="h-3.5 w-3.5" />
            <span>Testar VenteBot API</span>
          </Link>
          <Link
            href="/dashboard/produtos"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-all shadow-md shadow-indigo-600/20"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Gerenciar Catálogo</span>
          </Link>
        </div>
      </div>

      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Receita Bruta */}
        <div className="glass-card rounded-2xl p-5 border border-white/[0.07] relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Receita Bruta</span>
            <div className="h-9 w-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <h2 className="text-2xl font-bold text-white">
              ${receitaTotal.toFixed(2)}{" "}
              <span className="text-xs font-normal text-slate-400">USD</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <span>{pedidosPagos?.length || 0} pedidos pagos</span>
            </p>
          </div>
        </div>

        {/* Lucro Líquido / Margem */}
        <div className="glass-card rounded-2xl p-5 border border-white/[0.07] relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Margem Estimada</span>
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <h2 className="text-2xl font-bold text-emerald-400">
              ${margemTotal.toFixed(2)}{" "}
              <span className="text-xs font-normal text-emerald-300/70">USD</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Custo fornecedor: ${custoTotal.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Total de Pedidos */}
        <div className="glass-card rounded-2xl p-5 border border-white/[0.07] relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total de Pedidos</span>
            <div className="h-9 w-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <h2 className="text-2xl font-bold text-white">{totalPedidos || 0}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-amber-400 font-medium">
                {pedidosPendentes || 0} pendentes
              </span>
            </div>
          </div>
        </div>

        {/* Base de Clientes */}
        <div className="glass-card rounded-2xl p-5 border border-white/[0.07] relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Clientes Telegram</span>
            <div className="h-9 w-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <h2 className="text-2xl font-bold text-white">{totalClientes || 0}</h2>
            <p className="text-xs text-slate-400 mt-1">
              {totalProdutosAtivos || 0} produtos ativos no bot
            </p>
          </div>
        </div>
      </div>

      {/* Widget de Status da Integração VenteBot */}
      <div className="glass-panel rounded-2xl p-6 border border-white/[0.08]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-11 w-11 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 flex-shrink-0">
              <Plug className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white text-base">
                  VenteBot Reseller API v1.2
                </h3>
                {ventebotConfigurada ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                    Chave Configurada
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <AlertCircle className="h-3 w-3" />
                    Chave Pendente
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Conexão direta com a carteira de revendedor do fornecedor (@storeBatmanBot).
                Compras debitam automaticamente do saldo e entregam ao cliente do Telegram.
              </p>
            </div>
          </div>

          <Link
            href="/dashboard/integracoes/ventebot"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium bg-white/[0.05] hover:bg-white/[0.08] text-white border border-white/[0.1] transition-all whitespace-nowrap self-start md:self-auto"
          >
            <span>Ver Status da Carteira</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Tabela de Pedidos Recentes */}
      <div className="glass-panel rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="p-6 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white text-base">Pedidos Recentes</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Últimas transações geradas pelo Bot do Telegram
            </p>
          </div>
          <Link
            href="/dashboard/pedidos"
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Ver todos os pedidos →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/60 text-xs text-slate-400 border-b border-white/[0.06] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Ref. / Pedido</th>
                <th className="px-6 py-3.5">Cliente</th>
                <th className="px-6 py-3.5">Produto</th>
                <th className="px-6 py-3.5">Valor (Stars / USD)</th>
                <th className="px-6 py-3.5">Pagamento</th>
                <th className="px-6 py-3.5">Status Fornecedor</th>
                <th className="px-6 py-3.5">Entrega</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {ultimosPedidos && ultimosPedidos.length > 0 ? (
                ultimosPedidos.map((ped: any) => (
                  <tr key={ped.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-slate-300">
                      {ped.referencia_unica}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-300">
                      {ped.cliente?.username ? `@${ped.cliente.username}` : `ID: ${ped.cliente?.telegram_id}`}
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-white flex items-center gap-1.5">
                      <span>{ped.produto?.emoji || "📦"}</span>
                      <span>{ped.produto?.nome || "Produto Removido"}</span>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <span className="font-semibold text-indigo-400">{ped.total_stars} ⭐</span>{" "}
                      <span className="text-slate-500">(${Number(ped.total_usd).toFixed(2)})</span>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {ped.status_pagamento === "pago" ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Pago
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          Pendente
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <span className="text-slate-400">{ped.status_fornecedor}</span>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {ped.status_entrega === "entregue" ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Entregue
                        </span>
                      ) : ped.status_entrega === "falha_entrega" ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                          Falha
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full font-medium bg-slate-800 text-slate-400">
                          Aguardando
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500 text-xs">
                    Nenhum pedido realizado ainda. Quando clientes comprarem no Bot, os pedidos aparecerão aqui em tempo real.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
