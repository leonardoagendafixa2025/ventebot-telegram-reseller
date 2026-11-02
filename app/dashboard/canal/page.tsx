import { createAdminClient } from "@/lib/supabase/admin";
import { Radio, Send, CheckCircle2, AlertTriangle, Sparkles, RefreshCw, Bot } from "lucide-react";
import { TelegramBotClient } from "@/lib/telegram/client";
import { SyncService } from "@/lib/services/sync-service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CanalPage({
  searchParams,
}: {
  searchParams: Promise<{ sucesso?: string; erro?: string; alertas?: string }>;
}) {
  const { sucesso, erro, alertas } = await searchParams;
  const supabase = createAdminClient();

  const { data: produtos } = await supabase
    .from("produtos")
    .select("id, nome, emoji, preco_venda_stars, preco_venda_usd")
    .eq("ativo", true)
    .order("nome", { ascending: true });

  const { data: publicacoes } = await supabase
    .from("publicacoes_canal")
    .select("*, produto:produtos(nome)")
    .order("created_at", { ascending: false })
    .limit(20);

  const channelId = process.env.TELEGRAM_PUBLIC_CHANNEL_ID || "@ventedigital_oficial_promo";

  // Disparo Manual Específico
  async function sendBroadcast(formData: FormData) {
    "use server";
    const produtoId = formData.get("produto_id") as string;
    const tipo = (formData.get("tipo") as string) || "oferta";
    const mensagemCustom = formData.get("mensagem") as string;

    const serverSupabase = createAdminClient();
    const { data: prod } = await serverSupabase
      .from("produtos")
      .select("*")
      .eq("id", produtoId)
      .single();

    if (!prod) {
      redirect("/dashboard/canal?erro=Produto+não+encontrado");
    }

    const telegram = new TelegramBotClient();
    const rawChId = (process.env.TELEGRAM_PUBLIC_CHANNEL_ID || "").trim();
    const chId = (rawChId && rawChId !== "undefined" && rawChId !== "null" && rawChId !== "Não configurado")
      ? rawChId
      : "-1004394737360";
    const rawBotUser = (process.env.TELEGRAM_BOT_USERNAME || "").trim();
    const botUser = (rawBotUser && rawBotUser !== "undefined" && rawBotUser !== "null")
      ? rawBotUser.replace(/^@/, "")
      : "ventedigital_oficial_bot";

    const deepLink = `https://t.me/${botUser}?start=prod_${prod.id}`;

    const titulo =
      tipo === "restock"
        ? "⚡ <b>REPOSIÇÃO DE ESTOQUE!</b>"
        : "🔥 <b>OFERTA ESPECIAL DISPONÍVEL!</b>";

    const precoUsdt = Number(prod.preco_venda_usd).toFixed(2);
    const text = `${titulo}\n\n${prod.emoji || "📦"} <b>${prod.nome}</b>\n\n${
      mensagemCustom || prod.descricao || ""
    }\n\n💰 <b>Preço:</b> $${precoUsdt} USDT\n🛡️ <b>Garantia:</b> ${prod.garantia_dias} dias com entrega 100% automática!`;

    try {
      const sent = await telegram.sendMessage({
        chat_id: chId,
        text,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "🛒 Comprar no Bot Agora", url: deepLink }]],
        },
      });

      await serverSupabase.from("publicacoes_canal").insert({
        tipo,
        produto_id: prod.id,
        mensagem_telegram_id: sent.message_id,
        conteudo_publicado: text,
        status: "publicado",
      });

      revalidatePath("/dashboard/canal");
    } catch (e: any) {
      console.error("[Canal] Falha ao enviar para o canal:", e);
      redirect(`/dashboard/canal?erro=${encodeURIComponent(e.message || "Falha ao enviar ao Telegram")}`);
    }

    redirect("/dashboard/canal?sucesso=1");
  }

  // Execução do Piloto Automático (Sincronização + Alertas)
  async function runAutoSyncBroadcast() {
    "use server";
    try {
      const syncService = new SyncService();
      const result = await syncService.syncCatalog({
        broadcastAlerts: true,
        forceFeaturedIfQuiet: true,
        forceBroadcastNow: true,
      });

      revalidatePath("/dashboard/canal");
      redirect(`/dashboard/canal?sucesso=1&alertas=${result.broadcastsSent}`);
    } catch (e: any) {
      redirect(`/dashboard/canal?erro=${encodeURIComponent(e.message || "Falha na sincronização automática")}`);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex flex-wrap items-center gap-2.5 sm:gap-3">
          <Radio className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-400" />
          <span>Canal de Transmissão Telegram</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Publique ofertas manuais ou deixe o robô notificar novos produtos e reposições de estoque automaticamente.
        </p>
      </div>

      {sucesso && (
        <div className="p-3.5 sm:p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            <b>Operação concluída com sucesso!</b>{" "}
            {alertas ? `${alertas} alerta(s) disparado(s) no grupo ${channelId}.` : `A mensagem já está visível no grupo ${channelId}.`}
          </span>
        </div>
      )}

      {erro && (
        <div className="p-3.5 sm:p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span><b>Erro:</b> {erro}</span>
        </div>
      )}

      {/* Card do Piloto Automático */}
      <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-indigo-500/20 bg-gradient-to-r from-indigo-950/30 to-purple-950/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Bot className="h-5 w-5 text-indigo-400 shrink-0" />
              <h2 className="text-sm sm:text-base font-semibold text-white">
                Piloto Automático de Produtos Novos & Estoque
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ATIVO VIA CRON
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              O sistema monitora a API oficial da VenteBot a cada 2 horas. Sempre que um <b>novo produto</b> for lançado ou houver <b>reposição de estoque</b>, ele envia a notificação no grupo <code className="text-indigo-300 break-all">{channelId}</code> com botão de compra direta!
            </p>
          </div>

          <form action={runAutoSyncBroadcast} className="w-full sm:w-auto shrink-0">
            <button
              type="submit"
              className="w-full sm:w-auto px-4 py-3 sm:py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="h-4 w-4 text-amber-300" />
              <span>Sincronizar & Disparar Alerta Agora</span>
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
        {/* Formulário de Envio Manual */}
        <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-white/[0.08] h-fit">
          <h2 className="text-sm sm:text-base font-semibold text-white mb-2 flex items-center gap-2">
            <Send className="h-4 w-4 text-indigo-400" />
            <span>Publicar Oferta Manual no Canal</span>
          </h2>

          <div className="mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <p className="text-xs text-slate-400">Canal configurado:</p>
            <p className="text-xs font-mono font-semibold text-indigo-300 mt-0.5 break-all">
              {channelId}
            </p>
          </div>

          <form action={sendBroadcast} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Selecione o Produto
              </label>
              <select
                name="produto_id"
                required
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-white/[0.1] rounded-xl text-base sm:text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                {produtos && produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.emoji || "📦"} {p.nome} — ${Number(p.preco_venda_usd).toFixed(2)} USDT
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Tipo de Transmissão
              </label>
              <select
                name="tipo"
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-white/[0.1] rounded-xl text-base sm:text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="oferta">🔥 Oferta em Destaque</option>
                <option value="restock">⚡ Reposição de Estoque</option>
                <option value="novo_produto">🚀 Novo Produto</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Mensagem Personalizada (Opcional)
              </label>
              <textarea
                name="mensagem"
                rows={3}
                placeholder="Ex: Acabamos de repor contas com 30 dias de garantia!"
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-white/[0.1] rounded-xl text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 sm:py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2"
            >
              <Send className="h-4 w-4" />
              <span>Disparar para o Canal</span>
            </button>
          </form>
        </div>

        {/* Histórico de Publicações */}
        <div className="glass-panel rounded-2xl border border-white/[0.08] lg:col-span-2 overflow-hidden flex flex-col">
          <div className="p-4 sm:p-6 border-b border-white/[0.06] flex items-center justify-between">
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-white">
                Histórico de Transmissões
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Transmissões automáticas e manuais enviadas pelo Bot ao grupo público
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[480px]">
              <thead className="bg-slate-900/60 text-xs text-slate-400 border-b border-white/[0.06] uppercase tracking-wider">
                <tr>
                  <th className="px-4 sm:px-6 py-3.5">Tipo</th>
                  <th className="px-4 sm:px-6 py-3.5">Produto</th>
                  <th className="px-4 sm:px-6 py-3.5">Status</th>
                  <th className="px-4 sm:px-6 py-3.5">Data / Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {publicacoes && publicacoes.length > 0 ? (
                  publicacoes.map((pub: any) => (
                    <tr key={pub.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 sm:px-6 py-3.5 text-xs font-medium text-slate-300 capitalize">
                        {pub.tipo === "novo_produto" ? "🚀 Novo Produto" : pub.tipo === "restock" ? "⚡ Reposição" : "🔥 Oferta"}
                      </td>
                      <td className="px-4 sm:px-6 py-3.5 text-xs text-white">
                        {pub.produto?.nome || "Geral"}
                      </td>
                      <td className="px-4 sm:px-6 py-3.5 text-xs">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="h-3 w-3" />
                          {pub.status}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-3.5 text-xs text-slate-400 whitespace-nowrap">
                        {new Date(pub.created_at).toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 sm:px-6 py-8 text-center text-slate-500 text-xs">
                      Nenhuma transmissão realizada ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
