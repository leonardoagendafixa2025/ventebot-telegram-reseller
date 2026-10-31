import { createClient } from "@/lib/supabase/server";
import { ShoppingBag, RefreshCw, Eye, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("pedidos")
    .select(`
      *,
      produto:produtos(nome, emoji),
      cliente:clientes(username, telegram_id)
    `)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status_pagamento", status);
  }

  const { data: pedidos } = await query.limit(50);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <ShoppingBag className="h-6 w-6 text-indigo-400" />
            <span>Gerenciamento de Pedidos</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Acompanhamento em tempo real de pagamentos e fulfillment junto à VenteBot.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/pedidos"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              !status ? "bg-indigo-600 text-white" : "bg-white/[0.05] text-slate-400 hover:text-white"
            }`}
          >
            Todos
          </Link>
          <Link
            href="/dashboard/pedidos?status=pago"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              status === "pago"
                ? "bg-emerald-600 text-white"
                : "bg-white/[0.05] text-slate-400 hover:text-white"
            }`}
          >
            Pagos
          </Link>
          <Link
            href="/dashboard/pedidos?status=pendente"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              status === "pendente"
                ? "bg-amber-600 text-white"
                : "bg-white/[0.05] text-slate-400 hover:text-white"
            }`}
          >
            Pendentes
          </Link>
        </div>
      </div>

      <div className="glass-panel rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/60 text-xs text-slate-400 border-b border-white/[0.06] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Ref. Única</th>
                <th className="px-6 py-4">Data / Hora</th>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Produto & Qtd</th>
                <th className="px-6 py-4">Valor</th>
                <th className="px-6 py-4">Pagamento</th>
                <th className="px-6 py-4">Fornecedor</th>
                <th className="px-6 py-4">Entrega</th>
                <th className="px-6 py-4">Conteúdo Entregue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {pedidos && pedidos.length > 0 ? (
                pedidos.map((ped) => (
                  <tr key={ped.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-slate-300">
                      {ped.referencia_unica}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {new Date(ped.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-300">
                      {ped.cliente?.username ? `@${ped.cliente.username}` : `ID: ${ped.cliente?.telegram_id}`}
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-white">
                      <span>{ped.produto?.emoji || "📦"}</span> {ped.produto?.nome}{" "}
                      <span className="text-slate-400">({ped.quantidade}x)</span>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <span className="font-semibold text-indigo-400">{ped.total_stars} ⭐</span>{" "}
                      <span className="text-slate-500">(${Number(ped.total_usd).toFixed(2)})</span>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {ped.status_pagamento === "pago" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="h-3 w-3" />
                          Pago
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Clock className="h-3 w-3" />
                          Pendente
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono">
                      <span className="text-slate-300">{ped.status_fornecedor}</span>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {ped.status_entrega === "entregue" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Entregue
                        </span>
                      ) : ped.status_entrega === "falha_entrega" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                          Falha
                        </span>
                      ) : (
                        <span className="text-slate-500">Pendente</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono max-w-xs truncate text-slate-400">
                      {ped.conteudo_entregue ? (
                        <span className="text-emerald-300 truncate block max-w-[200px]" title={ped.conteudo_entregue}>
                          {ped.conteudo_entregue}
                        </span>
                      ) : ped.detalhes_falha ? (
                        <span className="text-red-400 truncate block max-w-[200px]" title={ped.detalhes_falha}>
                          {ped.detalhes_falha}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400 text-sm">
                    Nenhum pedido encontrado com os filtros selecionados.
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
