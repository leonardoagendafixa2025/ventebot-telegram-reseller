import { createClient } from "@/lib/supabase/server";
import { DollarSign, TrendingUp, CreditCard, Scale, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FinanceiroPage() {
  const supabase = await createClient();

  const { data: pedidosPagos } = await supabase
    .from("pedidos")
    .select("total_usd, custo_unitario_usd, quantidade, margem_total_usd, total_stars, metodo_pagamento, created_at")
    .eq("status_pagamento", "pago");

  const receitaBrutaUsd = (pedidosPagos || []).reduce((acc, p) => acc + Number(p.total_usd), 0);
  const custoFornecedorUsd = (pedidosPagos || []).reduce(
    (acc, p) => acc + Number(p.custo_unitario_usd) * p.quantidade,
    0
  );
  const lucroEstimadoUsd = (pedidosPagos || []).reduce(
    (acc, p) => acc + Number(p.margem_total_usd),
    0
  );
  const totalStarsArrecadados = (pedidosPagos || []).reduce(
    (acc, p) => acc + Number(p.total_stars),
    0
  );

  const margemPercentual =
    receitaBrutaUsd > 0 ? ((lucroEstimadoUsd / receitaBrutaUsd) * 100).toFixed(1) : "0.0";

  // Transações de pagamento registradas com hash oficial
  const { data: pagamentos } = await supabase
    .from("pagamentos")
    .select(`
      *,
      pedido:pedidos(referencia_unica, total_usd)
    `)
    .order("confirmado_em", { ascending: false })
    .limit(30);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
          <DollarSign className="h-6 w-6 text-emerald-400" />
          <span>Gestão Financeira & Margem</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Demonstrativo de receitas em Telegram Stars, custos debitados pelo fornecedor e lucro líquido.
        </p>
      </div>

      {/* Cards Financeiros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass-card rounded-2xl p-5 border border-white/[0.07]">
          <span className="text-xs font-medium text-slate-400">Receita Bruta Recebida</span>
          <h2 className="text-2xl font-bold text-white mt-2">
            ${receitaBrutaUsd.toFixed(2)}{" "}
            <span className="text-xs font-normal text-slate-400">USD</span>
          </h2>
          <p className="text-xs text-indigo-400 mt-1 font-semibold">
            {totalStarsArrecadados} ⭐ Telegram Stars
          </p>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-white/[0.07]">
          <span className="text-xs font-medium text-slate-400">Custo Total VenteBot</span>
          <h2 className="text-2xl font-bold text-slate-200 mt-2">
            ${custoFornecedorUsd.toFixed(2)}{" "}
            <span className="text-xs font-normal text-slate-400">USD</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Debitado da carteira de revenda
          </p>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-white/[0.07]">
          <span className="text-xs font-medium text-slate-400">Lucro Líquido Estimado</span>
          <h2 className="text-2xl font-bold text-emerald-400 mt-2">
            ${lucroEstimadoUsd.toFixed(2)}{" "}
            <span className="text-xs font-normal text-emerald-300/70">USD</span>
          </h2>
          <p className="text-xs text-emerald-400/80 mt-1 font-medium">
            Margem média: {margemPercentual}%
          </p>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-white/[0.07]">
          <span className="text-xs font-medium text-slate-400">Pagamentos Validados</span>
          <h2 className="text-2xl font-bold text-white mt-2">
            {pagamentos?.length || 0}
          </h2>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>100% via fonte oficial</span>
          </p>
        </div>
      </div>

      {/* Livro-Razão de Pagamentos Oficiais */}
      <div className="glass-panel rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="p-6 border-b border-white/[0.06]">
          <h3 className="font-semibold text-white text-base">
            Registro Oficial de Pagamentos (Trilha de Auditoria)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Transações com ID oficial assinado pelo Telegram Stars
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/60 text-xs text-slate-400 border-b border-white/[0.06] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Ref. Pedido</th>
                <th className="px-6 py-4">Charge ID Oficial</th>
                <th className="px-6 py-4">Valor em Stars</th>
                <th className="px-6 py-4">Provedor</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Data / Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {pagamentos && pagamentos.length > 0 ? (
                pagamentos.map((pag: any) => (
                  <tr key={pag.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-slate-300">
                      {pag.pedido?.referencia_unica || "—"}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-indigo-300 max-w-xs truncate">
                      <code>{pag.referencia_externa}</code>
                    </td>
                    <td className="px-6 py-4 text-xs font-semibold text-amber-300">
                      {pag.valor_stars} ⭐
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-300 font-medium">
                      {pag.provedor}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <span className="inline-flex px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {pag.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {new Date(pag.confirmado_em).toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-500 text-xs">
                    Nenhum registro de pagamento confirmado até o momento.
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
