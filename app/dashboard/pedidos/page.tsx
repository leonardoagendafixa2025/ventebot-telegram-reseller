"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ShoppingBag,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Loader2,
  XCircle,
  Send,
  FileText,
  X,
} from "lucide-react";
import { toast } from "sonner";

type Pedido = {
  id: string;
  referencia_unica: string;
  created_at: string;
  status_pagamento: string;
  status_fornecedor: string | null;
  status_entrega: string;
  conteudo_entregue: string | null;
  detalhes_falha: string | null;
  total_usd: number;
  quantidade: number;
  binance_tx_id: string | null;
  produto: { nome: string; emoji: string } | null;
  cliente: { username: string | null; telegram_id: number } | null;
};

const STATUS_REPROCESSAVEL = ["fornecedor_erro", "fornecedor_status_desconhecido", null, ""];

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"todos" | "pago" | "pendente" | "erro">("todos");
  const [retrying, setRetrying] = useState<string | null>(null);
  const [manualModal, setManualModal] = useState<{
    pedidoId: string;
    referencia: string;
    cliente: string;
    produto: string;
  } | null>(null);
  const [manualContent, setManualContent] = useState("");
  const [submittingManual, setSubmittingManual] = useState(false);
  const [, startTransition] = useTransition();

  async function handleManualDeliver(e: React.FormEvent) {
    e.preventDefault();
    if (!manualModal || !manualContent.trim()) return;

    setSubmittingManual(true);
    try {
      const res = await fetch("/api/orders/manual-deliver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pedidoId: manualModal.pedidoId,
          conteudo: manualContent.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erro na entrega manual.");

      toast.success("✅ Pedido entregue e credenciais enviadas ao cliente no Telegram!");
      setManualModal(null);
      setManualContent("");
      fetchPedidos();
    } catch (err: any) {
      toast.error(err.message || "Falha ao entregar manualmente.");
    } finally {
      setSubmittingManual(false);
    }
  }

  async function handleCancelOrder(pedidoId: string, referencia: string) {
    if (!confirm(`Tem certeza que deseja cancelar o pedido ${referencia}?`)) return;
    try {
      const res = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pedidoId,
          motivo: "Item indisponível no fornecedor. Cancelado pelo suporte.",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erro ao cancelar pedido.");

      toast.success("Pedido cancelado e cliente notificado.");
      fetchPedidos();
    } catch (err: any) {
      toast.error(err.message || "Falha ao cancelar.");
    }
  }

  async function fetchPedidos() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtro !== "todos") params.set("filtro", filtro);
      const res = await fetch(`/api/orders/list?${params.toString()}`);
      if (!res.ok) throw new Error("Erro ao carregar pedidos");
      const data = await res.json();
      setPedidos(data.pedidos || []);
    } catch (e: any) {
      toast.error(e.message || "Falha ao carregar pedidos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPedidos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  async function handleRetry(pedidoId: string, referencia: string) {
    if (retrying) return;
    setRetrying(pedidoId);
    try {
      toast.loading(`Reprocessando pedido ${referencia}...`, { id: "retry" });
      const res = await fetch("/api/orders/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidoId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || "Pedido reprocessado com sucesso! Cliente notificado.", { id: "retry" });
        startTransition(() => {
          fetchPedidos();
        });
      } else {
        toast.error(data.message || "Falha ao reprocessar.", { id: "retry" });
      }
    } catch (e: any) {
      toast.error(e.message || "Erro de rede.", { id: "retry" });
    } finally {
      setRetrying(null);
    }
  }

  const pedidosErro = pedidos.filter(
    (p) => p.status_pagamento === "pago" && STATUS_REPROCESSAVEL.includes(p.status_fornecedor) && p.status_entrega !== "entregue"
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex flex-wrap items-center gap-2.5 sm:gap-3">
            <ShoppingBag className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-400" />
            <span>Gerenciamento de Pedidos</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Acompanhe pagamentos, fulfillment e libere pedidos pendentes manualmente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["todos", "pago", "pendente", "erro"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-colors capitalize relative ${
                filtro === f
                  ? f === "erro"
                    ? "bg-red-600 text-white"
                    : f === "pago"
                    ? "bg-emerald-600 text-white"
                    : f === "pendente"
                    ? "bg-amber-600 text-white"
                    : "bg-indigo-600 text-white"
                  : "bg-white/[0.05] text-slate-400 hover:text-white"
              }`}
            >
              {f === "erro" ? "⚠️ Erros" : f === "pago" ? "✅ Pagos" : f === "pendente" ? "⏳ Pendentes" : "Todos"}
              {f === "erro" && pedidosErro.length > 0 && filtro !== "erro" && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {pedidosErro.length}
                </span>
              )}
            </button>
          ))}

          <button
            onClick={fetchPedidos}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl text-xs font-medium bg-white/[0.05] text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Alert para pedidos com erro */}
      {pedidosErro.length > 0 && filtro !== "erro" && (
        <div
          onClick={() => setFiltro("erro")}
          className="cursor-pointer p-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 hover:bg-red-500/15 transition-colors"
        >
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-300">
              {pedidosErro.length} pedido{pedidosErro.length > 1 ? "s" : ""} aguardando reprocessamento
            </p>
            <p className="text-xs text-red-400/80 mt-0.5">
              Clientes pagaram mas a entrega falhou (saldo insuficiente no fornecedor). Clique aqui para ver e liberar.
            </p>
          </div>
        </div>
      )}

      <div className="glass-panel rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[900px]">
            <thead className="bg-slate-900/60 text-xs text-slate-400 border-b border-white/[0.06] uppercase tracking-wider">
              <tr>
                <th className="px-5 py-4">Ref. Única</th>
                <th className="px-5 py-4">Data</th>
                <th className="px-5 py-4">Cliente</th>
                <th className="px-5 py-4">Produto & Qtd</th>
                <th className="px-5 py-4">Valor</th>
                <th className="px-5 py-4">Pagamento</th>
                <th className="px-5 py-4">Fornecedor</th>
                <th className="px-5 py-4">Entrega</th>
                <th className="px-5 py-4">Conteúdo / Falha</th>
                <th className="px-5 py-4 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-500 text-sm">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Carregando pedidos...
                  </td>
                </tr>
              ) : pedidos.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-400 text-sm">
                    Nenhum pedido encontrado.
                  </td>
                </tr>
              ) : (
                pedidos.map((ped) => {
                  const podeReprocessar =
                    ped.status_pagamento === "pago" &&
                    STATUS_REPROCESSAVEL.includes(ped.status_fornecedor) &&
                    ped.status_entrega !== "entregue";
                  const isRetrying = retrying === ped.id;

                  return (
                    <tr
                      key={ped.id}
                      className={`hover:bg-white/[0.02] transition-colors ${
                        podeReprocessar ? "border-l-2 border-l-red-500/60" : ""
                      }`}
                    >
                      {/* Ref */}
                      <td className="px-5 py-4 font-mono text-xs text-slate-300">
                        {ped.referencia_unica}
                      </td>
                      {/* Data */}
                      <td className="px-5 py-4 text-xs text-slate-400">
                        {new Date(ped.created_at).toLocaleString("pt-BR")}
                      </td>
                      {/* Cliente */}
                      <td className="px-5 py-4 text-xs text-slate-300">
                        {ped.cliente?.username ? `@${ped.cliente.username}` : `ID: ${ped.cliente?.telegram_id}`}
                      </td>
                      {/* Produto */}
                      <td className="px-5 py-4 text-xs font-medium text-white">
                        <span>{ped.produto?.emoji || "📦"}</span> {ped.produto?.nome}{" "}
                        <span className="text-slate-400">({ped.quantidade}x)</span>
                      </td>
                      {/* Valor */}
                      <td className="px-5 py-4 text-xs">
                        <span className="font-semibold text-emerald-400 font-mono">
                          ${Number(ped.total_usd).toFixed(2)} USDT
                        </span>
                      </td>
                      {/* Pagamento */}
                      <td className="px-5 py-4 text-xs">
                        {ped.status_pagamento === "pago" ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="h-3 w-3" />
                              Pago
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock className="h-3 w-3" />
                            Pendente
                          </span>
                        )}
                      </td>
                      {/* Fornecedor Status */}
                      <td className="px-5 py-4 text-xs font-mono">
                        {ped.status_fornecedor === "fornecedor_erro" ? (
                          <span className="inline-flex items-center gap-1 text-red-400">
                            <XCircle className="h-3 w-3" />
                            fornecedor_erro
                          </span>
                        ) : (
                          <span className="text-slate-400">{ped.status_fornecedor || "—"}</span>
                        )}
                      </td>
                      {/* Entrega */}
                      <td className="px-5 py-4 text-xs">
                        {ped.status_entrega === "entregue" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3" />
                            Entregue
                          </span>
                        ) : ped.status_entrega === "falha_entrega" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                            <XCircle className="h-3 w-3" />
                            Falha
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-400">
                            <Clock className="h-3 w-3" />
                            Pendente
                          </span>
                        )}
                      </td>
                      {/* Conteúdo / Falha */}
                      <td className="px-5 py-4 text-xs font-mono max-w-[180px]">
                        {ped.conteudo_entregue ? (
                          <span className="text-emerald-300 truncate block" title={ped.conteudo_entregue}>
                            {ped.conteudo_entregue.slice(0, 60)}…
                          </span>
                        ) : ped.detalhes_falha ? (
                          <span className="text-red-400 truncate block" title={ped.detalhes_falha}>
                            {ped.detalhes_falha.slice(0, 60)}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      {/* Ação */}
                      <td className="px-5 py-4 text-center">
                        {podeReprocessar ? (
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <button
                              onClick={() => handleRetry(ped.id, ped.referencia_unica)}
                              disabled={!!retrying}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-orange-500/15 text-orange-300 border border-orange-500/30 hover:bg-orange-500/25 hover:text-orange-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Tentar comprar novamente no fornecedor"
                            >
                              {isRetrying ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3" />
                              )}
                              {isRetrying ? "Liberando…" : "Liberar"}
                            </button>

                            <button
                              onClick={() => {
                                setManualModal({
                                  pedidoId: ped.id,
                                  referencia: ped.referencia_unica,
                                  cliente: ped.cliente?.username ? `@${ped.cliente.username}` : `TG:${ped.cliente?.telegram_id}`,
                                  produto: `${ped.produto?.emoji || "📦"} ${ped.produto?.nome || "Produto Digital"} (${ped.quantidade}x)`,
                                });
                                setManualContent("");
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 hover:text-indigo-200 transition-all"
                              title="Entregar credenciais/acesso manualmente ao cliente no Telegram"
                            >
                              <FileText className="h-3 w-3" />
                              Manual
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-700 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Entrega Manual */}
      {manualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-white/[0.12] shadow-2xl p-6 relative space-y-4">
            <button
              onClick={() => setManualModal(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-400" />
                Entrega Manual de Credenciais
              </h2>
              <p className="text-xs text-slate-400">
                Envie dados de login, contas, links ou chaves de ativação diretamente para o cliente via Telegram.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs space-y-1.5 font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Pedido:</span>
                <span className="text-white font-semibold">{manualModal.referencia}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Cliente:</span>
                <span className="text-indigo-300">{manualModal.cliente}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Produto:</span>
                <span className="text-emerald-300">{manualModal.produto}</span>
              </div>
            </div>

            <form onSubmit={handleManualDeliver} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Dados de acesso / Licença (será entregue formatado no chat):
                </label>
                <textarea
                  value={manualContent}
                  onChange={(e) => setManualContent(e.target.value)}
                  placeholder="Ex:&#10;Email: usuario@exemplo.com&#10;Senha: SenhaSegura123&#10;Link: https://muse.ai/login"
                  rows={4}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/[0.12] text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Ao confirmar, o bot enviará uma mensagem instantânea ao cliente no Telegram com essas credenciais e marcará o pedido como <b>Entregue</b>.
                </span>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => handleCancelOrder(manualModal.pedidoId, manualModal.referencia)}
                  className="px-3 py-2 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  Cancelar Pedido
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setManualModal(null)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
                  >
                    Fechar
                  </button>
                  <button
                    type="submit"
                    disabled={submittingManual || !manualContent.trim()}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all flex items-center gap-1.5 shadow-lg shadow-indigo-600/25 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submittingManual ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    {submittingManual ? "Enviando…" : "Enviar ao Cliente"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
