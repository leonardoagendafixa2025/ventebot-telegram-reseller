"use client";

import { useState } from "react";
import {
  Plug,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  Activity,
  ShieldAlert,
  ArrowRight,
  Database,
} from "lucide-react";
import { toast } from "sonner";

export default function VenteBotIntegrationPage() {
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  async function handleTestConnection() {
    setTesting(true);
    try {
      const res = await fetch("/api/ventebot/test-connection", { method: "POST" });
      const data = await res.json();

      setTestResult(data);
      if (data.connected) {
        toast.success(data.message || "Conectado à VenteBot com sucesso!");
      } else {
        toast.error(data.message || "Falha na conexão com a VenteBot.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro de rede ao testar conexão.");
      setTestResult({ connected: false, message: err.message });
    } finally {
      setTesting(false);
    }
  }

  async function handleSyncCatalog() {
    setSyncing(true);
    try {
      const res = await fetch("/api/ventebot/sync", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        toast.success(
          `Catálogo sincronizado! ${data.created} produtos novos, ${data.updated} atualizados.`
        );
      } else {
        toast.error(
          `Sincronização parcial ou com erros: ${(data.errors || []).join(", ") || data.message}`
        );
      }
    } catch (err: any) {
      toast.error(err.message || "Erro de rede ao sincronizar catálogo.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleReconcile() {
    setReconciling(true);
    try {
      const res = await fetch("/api/orders/reconcile", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        toast.success(
          `Reconciliação concluída! ${data.reconciled_count} pedidos atualizados.`
        );
      } else {
        toast.error(data.message || "Falha na reconciliação.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao reconciliar pedidos.");
    } finally {
      setReconciling(false);
    }
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex flex-wrap items-center gap-2.5 sm:gap-3">
          <Plug className="h-5 w-5 sm:h-6 sm:w-6 text-violet-400" />
          <span>Integração Oficial VenteBot Reseller API</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Gerenciamento e diagnóstico da conexão com o fornecedor oficial via <code>X-Reseller-Key</code>.
        </p>
      </div>

      {/* Ações e Diagnóstico Rápido */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {/* Testar Conexão */}
        <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-white/[0.08] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                Diagnóstico de Conexão
              </span>
              <Activity className="h-4 w-4 text-violet-400" />
            </div>
            <h3 className="text-sm sm:text-base font-semibold text-white">Status da API & Saldo</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Executa uma chamada autenticada segura para <code>GET /api/reseller/me</code> medindo latência e saldo.
            </p>
          </div>

          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="mt-5 sm:mt-6 w-full py-3 sm:py-2.5 px-4 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center gap-2 shadow-md shadow-violet-600/20 transition-all disabled:opacity-50"
          >
            {testing ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Testando Conexão...</span>
              </>
            ) : (
              <>
                <Plug className="h-3.5 w-3.5" />
                <span>Testar Conexão com VenteBot</span>
              </>
            )}
          </button>
        </div>

        {/* Sincronizar Produtos */}
        <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-white/[0.08] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                Catálogo Remoto
              </span>
              <Database className="h-4 w-4 text-indigo-400" />
            </div>
            <h3 className="text-sm sm:text-base font-semibold text-white">Sincronizar Catálogo</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Baixa produtos ativos, custos em USD e disponibilidade em <code>GET /api/reseller/products</code>.
            </p>
          </div>

          <button
            onClick={handleSyncCatalog}
            disabled={syncing}
            className="mt-5 sm:mt-6 w-full py-3 sm:py-2.5 px-4 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
          >
            {syncing ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Sincronizando...</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Sincronizar Produtos Agora</span>
              </>
            )}
          </button>
        </div>

        {/* Reconciliar Pedidos */}
        <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-white/[0.08] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Fulfillment
              </span>
              <Wallet className="h-4 w-4 text-emerald-400" />
            </div>
            <h3 className="text-sm sm:text-base font-semibold text-white">Reconciliar Pedidos</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Verifica pedidos em ativação ou com status pendente e sincroniza entrega com a VenteBot.
            </p>
          </div>

          <button
            onClick={handleReconcile}
            disabled={reconciling}
            className="mt-5 sm:mt-6 w-full py-3 sm:py-2.5 px-4 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50"
          >
            {reconciling ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Reconciliando...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Reconciliar Entregas Pendentes</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Resultado do Teste de Conexão */}
      {testResult && (
        <div
          className={`glass-panel rounded-2xl p-6 border ${
            testResult.connected ? "border-emerald-500/30 bg-emerald-950/10" : "border-red-500/30 bg-red-950/10"
          }`}
        >
          <div className="flex items-start gap-4">
            {testResult.connected ? (
              <div className="h-10 w-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            ) : (
              <div className="h-10 w-10 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400">
                <ShieldAlert className="h-5 w-5" />
              </div>
            )}

            <div className="flex-1">
              <h3 className="font-semibold text-white text-base">
                {testResult.connected ? "Conexão Estabelecida com Sucesso" : "Falha na Conexão"}
              </h3>
              <p className="text-sm text-slate-300 mt-1">{testResult.message}</p>

              {testResult.connected && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-white/[0.08]">
                  <div>
                    <span className="text-[11px] text-slate-400 uppercase font-semibold">
                      Saldo da Carteira
                    </span>
                    <p className="text-lg font-bold text-emerald-400 mt-0.5">
                      ${testResult.wallet_balance_usd?.toFixed(2)} USD
                    </p>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-400 uppercase font-semibold">
                      Latência da API
                    </span>
                    <p className="text-lg font-bold text-white mt-0.5">
                      {testResult.latency_ms} ms
                    </p>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-400 uppercase font-semibold">
                      Identificador Telegram
                    </span>
                    <p className="text-sm font-medium text-slate-200 mt-1">
                      {testResult.username ? `@${testResult.username}` : testResult.user_telegram_id}
                    </p>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-400 uppercase font-semibold">
                      Nome da Chave
                    </span>
                    <p className="text-sm font-medium text-slate-200 mt-1">
                      {testResult.key_name || "Parceiro Oficial"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Regras e Diretrizes de Segurança */}
      <div className="glass-panel rounded-2xl p-6 border border-white/[0.08] space-y-4">
        <h3 className="font-semibold text-white text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span>Informações de Segurança da Integração</span>
        </h3>

        <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside">
          <li>
            <b>Armazenamento da Chave:</b> A <code>VENTEBOT_RESELLER_KEY</code> fica exclusivamente no ambiente do servidor. Ela jamais é trafegada para o navegador ou exposta em respostas de API.
          </li>
          <li>
            <b>Saldo da Carteira do Fornecedor:</b> As compras de produtos no fornecedor debitam diretamente da sua carteira VenteBot. Antes de cada pedido, o sistema valida se há saldo suficiente para evitar compras incompletas.
          </li>
          <li>
            <b>Idempotência Estrita:</b> Cada requisição de compra utiliza uma chave de idempotência única vinculada ao pedido interno, impedindo compras duplicadas no fornecedor em caso de timeout de rede.
          </li>
          <li>
            <b>Produtos e Estoque:</b> Os produtos disponíveis para revenda são exclusivamente os retornados pela API oficial em <code>https://web-production-1c7b1.up.railway.app</code>.
          </li>
        </ul>
      </div>
    </div>
  );
}
