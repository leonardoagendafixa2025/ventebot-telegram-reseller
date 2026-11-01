import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Radio, Send, CheckCircle2, AlertTriangle } from "lucide-react";
import { TelegramBotClient } from "@/lib/telegram/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CanalPage({
  searchParams,
}: {
  searchParams: Promise<{ sucesso?: string; erro?: string }>;
}) {
  const { sucesso, erro } = await searchParams;
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
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || "ventedigital_oficial_bot";

  async function sendBroadcast(formData: FormData) {
    "use server";
    const produtoId = formData.get("produto_id") as string;
    const tipo = formData.get("tipo") as string;
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
    const chId = process.env.TELEGRAM_PUBLIC_CHANNEL_ID || "@ventedigital_oficial_promo";
    const botUser = (process.env.TELEGRAM_BOT_USERNAME || "ventedigital_oficial_bot").replace(/^@/, "");

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
          <Radio className="h-6 w-6 text-indigo-400" />
          <span>Canal de Transmissão Telegram</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Publique ofertas, novidades e reposições automáticas com deep link direto para o Bot.
        </p>
      </div>

      {sucesso && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span><b>Publicação enviada com sucesso!</b> A mensagem já está visível no grupo {channelId}.</span>
        </div>
      )}

      {erro && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span><b>Erro ao publicar:</b> {erro}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulário de Envio */}
        <div className="glass-panel rounded-2xl p-6 border border-white/[0.08] h-fit">
          <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
            <Send className="h-4 w-4 text-indigo-400" />
            <span>Publicar Oferta no Canal</span>
          </h2>

          <div className="mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <p className="text-xs text-slate-400">Canal configurado:</p>
            <p className="text-xs font-mono font-semibold text-indigo-300 mt-0.5">
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
                className="w-full px-3.5 py-2 bg-slate-900 border border-white/[0.1] rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
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
                className="w-full px-3.5 py-2 bg-slate-900 border border-white/[0.1] rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="oferta">🔥 Oferta em Destaque</option>
                <option value="restock">⚡ Reposição de Estoque</option>
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
                className="w-full px-3.5 py-2 bg-slate-900 border border-white/[0.1] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Disparar para o Canal</span>
            </button>
          </form>
        </div>

        {/* Histórico de Envios */}
        <div className="lg:col-span-2 glass-panel rounded-2xl border border-white/[0.08] overflow-hidden">
          <div className="p-6 border-b border-white/[0.06]">
            <h3 className="font-semibold text-white text-base">Histórico de Publicações</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Transmissões enviadas pelo Bot ao canal público
            </p>
          </div>

          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/60 text-xs text-slate-400 border-b border-white/[0.06] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Tipo</th>
                <th className="px-6 py-3.5">Produto</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Data / Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {publicacoes && publicacoes.length > 0 ? (
                publicacoes.map((pub: any) => (
                  <tr key={pub.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 text-xs font-medium text-slate-300 capitalize">
                      {pub.tipo}
                    </td>
                    <td className="px-6 py-4 text-xs text-white">
                      {pub.produto?.nome || "Geral"}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="h-3 w-3" />
                        {pub.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {new Date(pub.created_at).toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500 text-xs">
                    Nenhuma transmissão realizada ainda.
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
