import { createClient } from "@/lib/supabase/server";
import { FileText, CheckCircle2, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const supabase = await createClient();

  // 1. Logs de eventos da VenteBot
  const { data: eventosFornecedor } = await supabase
    .from("fornecedor_eventos")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);

  // 2. Logs de auditoria do sistema
  const { data: logsAuditoria } = await supabase
    .from("logs_auditoria")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex flex-wrap items-center gap-2.5 sm:gap-3">
          <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-400" />
          <span>Auditoria & Logs de Integração</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Trilha de auditoria das chamadas à VenteBot Reseller API e ações executadas por administradores.
        </p>
      </div>

      {/* Tabela de Eventos da VenteBot */}
      <div className="glass-panel rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-white/[0.06]">
          <h3 className="font-semibold text-white text-sm sm:text-base">
            Eventos da VenteBot Reseller API (Sanitizados)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Comunicação HTTP com o fornecedor oficial (chaves e dados confidenciais são redigidos)
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[650px]">
            <thead className="bg-slate-900/60 text-xs text-slate-400 border-b border-white/[0.06] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Ação</th>
                <th className="px-6 py-4">Endpoint</th>
                <th className="px-6 py-4">Status HTTP</th>
                <th className="px-6 py-4">Duração</th>
                <th className="px-6 py-4">Resultado</th>
                <th className="px-6 py-4">Data / Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {eventosFornecedor && eventosFornecedor.length > 0 ? (
                eventosFornecedor.map((ev: any) => (
                  <tr key={ev.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 text-xs font-semibold text-indigo-300 font-mono">
                      {ev.acao}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-300">
                      {ev.endpoint}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">
                      <span
                        className={
                          ev.status_http >= 200 && ev.status_http < 300
                            ? "text-emerald-400 font-semibold"
                            : "text-red-400 font-semibold"
                        }
                      >
                        {ev.status_http || "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-400">
                      {ev.tempo_execucao_ms ? `${ev.tempo_execucao_ms}ms` : "—"}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {ev.sucesso ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Sucesso
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-400 font-medium" title={ev.mensagem_erro}>
                          <XCircle className="h-3.5 w-3.5" />
                          {ev.mensagem_erro ? ev.mensagem_erro.slice(0, 30) + "..." : "Erro"}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {new Date(ev.created_at).toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-500 text-xs">
                    Nenhum evento registrado ainda. Quando chamadas à VenteBot ocorrerem, os registros aparecerão aqui.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabela de Auditoria Administrativa */}
      <div className="glass-panel rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-white/[0.06]">
          <h3 className="font-semibold text-white text-sm sm:text-base">
            Logs de Auditoria Administrativa
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Ações críticas executadas por usuários no painel
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[500px]">
            <thead className="bg-slate-900/60 text-xs text-slate-400 border-b border-white/[0.06] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Ação</th>
                <th className="px-6 py-4">Entidade</th>
                <th className="px-6 py-4">ID Entidade</th>
                <th className="px-6 py-4">Data / Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {logsAuditoria && logsAuditoria.length > 0 ? (
                logsAuditoria.map((log: any) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 text-xs font-semibold text-white font-mono">
                      {log.acao}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-300">
                      {log.entidade}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-400 truncate max-w-xs">
                      {log.entidade_id || "—"}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {new Date(log.created_at).toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500 text-xs">
                    Nenhum log de auditoria registrado ainda.
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
