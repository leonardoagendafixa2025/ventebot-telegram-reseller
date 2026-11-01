import { createClient } from "@/lib/supabase/server";
import { Settings, CheckCircle2, AlertTriangle, ShieldCheck, Terminal, Wallet, Save } from "lucide-react";
import { TelegramBotClient } from "@/lib/telegram/client";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const supabase = await createClient();

  const { data: configs } = await supabase
    .from("configuracoes")
    .select("chave, valor")
    .in("chave", ["binance_id", "binance_nome_titular", "binance_moeda"]);

  const configMap = Object.fromEntries((configs || []).map((c) => [c.chave, c.valor]));
  const currentBinanceId = configMap["binance_id"] || "1257797463";
  const currentTitular = configMap["binance_nome_titular"] || "VenteDigital Oficial";
  const currentMoeda = configMap["binance_moeda"] || "USDT";

  const envStatus = [
    {
      name: "NEXT_PUBLIC_SUPABASE_URL",
      defined: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      description: "URL da instância Supabase PostgreSQL",
    },
    {
      name: "SUPABASE_SERVICE_ROLE_KEY",
      defined: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      description: "Chave Service Role com privilégios administrativos no backend",
    },
    {
      name: "VENTEBOT_RESELLER_KEY",
      defined: Boolean(process.env.VENTEBOT_RESELLER_KEY),
      description: "Chave oficial de integração da VenteBot Reseller API",
    },
    {
      name: "TELEGRAM_BOT_TOKEN",
      defined: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      description: "Token do bot emitido pelo @BotFather",
    },
    {
      name: "TELEGRAM_WEBHOOK_SECRET",
      defined: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      description: "Segredo de validação das atualizações webhook do Telegram",
    },
    {
      name: "TELEGRAM_BOT_USERNAME",
      defined: Boolean(process.env.TELEGRAM_BOT_USERNAME),
      description: "Nome de usuário do bot para deep links (ex: loja_bot)",
    },
    {
      name: "TELEGRAM_PUBLIC_CHANNEL_ID",
      defined: Boolean(process.env.TELEGRAM_PUBLIC_CHANNEL_ID),
      description: "ID do canal público de ofertas e novidades",
    },
    {
      name: "ADMIN_BOOTSTRAP_SECRET",
      defined: Boolean(process.env.ADMIN_BOOTSTRAP_SECRET),
      description: "Chave secreta para cadastro controlado do primeiro admin",
    },
  ];

  async function registerTelegramWebhook() {
    "use server";
    const telegram = new TelegramBotClient();
    const appUrl = process.env.APP_BASE_URL || "";
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!appUrl || !telegram.hasToken()) return;

    const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;
    await telegram.setWebhook(webhookUrl, secret);
    await telegram.setMyCommands();

    revalidatePath("/dashboard/configuracoes");
  }

  async function updateBinanceConfig(formData: FormData) {
    "use server";
    const binanceId = (formData.get("binance_id") as string || "").trim();
    const titular = (formData.get("binance_nome_titular") as string || "").trim();
    const moeda = (formData.get("binance_moeda") as string || "USDT").trim();

    const serverSupabase = await createClient();
    await serverSupabase.from("configuracoes").upsert([
      { chave: "binance_id", valor: binanceId, tipo: "string" },
      { chave: "binance_nome_titular", valor: titular, tipo: "string" },
      { chave: "binance_moeda", valor: moeda, tipo: "string" },
    ]);

    revalidatePath("/dashboard/configuracoes");
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex flex-wrap items-center gap-2.5 sm:gap-3">
          <Settings className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-400" />
          <span>Configurações do Sistema</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Gerenciamento do recebimento via Binance UID, webhook do Telegram e ambiente do servidor.
        </p>
      </div>

      {/* Configuração do Binance UID para Recebimento */}
      <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-white/[0.08]">
        <h3 className="font-semibold text-white text-sm sm:text-base mb-1 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-400" />
          <span>Recebimento Automático via Binance UID</span>
        </h3>
        <p className="text-xs text-slate-400 mb-5 leading-relaxed">
          Os clientes realizam a transferência direta para o seu UID e a entrega digital é liberada 100% no automático assim que o ID de pagamento é informado.
        </p>

        <form action={updateBinanceConfig} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Seu Binance UID (Conta de Recebimento)
            </label>
            <input
              type="text"
              name="binance_id"
              defaultValue={currentBinanceId}
              required
              className="w-full bg-slate-900/60 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-base sm:text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Nome do Titular (Exibido no Bot)
            </label>
            <input
              type="text"
              name="binance_nome_titular"
              defaultValue={currentTitular}
              className="w-full bg-slate-900/60 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-base sm:text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Moeda Principal de Cobrança
            </label>
            <input
              type="text"
              name="binance_moeda"
              defaultValue={currentMoeda}
              className="w-full bg-slate-900/60 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-base sm:text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
            <button
              type="submit"
              className="w-full sm:w-auto py-3 sm:py-2.5 px-4 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Salvar Dados da Binance</span>
            </button>
          </div>
        </form>
      </div>

      {/* Ações Rápidas de Configuração do Telegram */}
      <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-white/[0.08]">
        <h3 className="font-semibold text-white text-sm sm:text-base mb-2 flex items-center gap-2">
          <Terminal className="h-4 w-4 text-indigo-400" />
          <span>Configuração Automática do Webhook do Telegram</span>
        </h3>
        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          Registra o endpoint <code>/api/telegram/webhook</code> no Telegram com o segredo configurado e instala o menu de comandos oficial.
        </p>

        <form action={registerTelegramWebhook}>
          <button
            type="submit"
            className="w-full sm:w-auto py-3 sm:py-2.5 px-4 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Configurar / Renovar Webhook Oficial</span>
          </button>
        </form>
      </div>

      {/* Checklist de Variáveis de Ambiente */}
      <div className="glass-panel rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-white/[0.06]">
          <h3 className="font-semibold text-white text-sm sm:text-base">
            Checklist de Variáveis de Ambiente (Servidor)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Estado das variáveis necessárias para o funcionamento pleno do sistema
          </p>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {envStatus.map((item) => (
            <div
              key={item.name}
              className="px-4 sm:px-6 py-3.5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 hover:bg-white/[0.02] transition-colors"
            >
              <div>
                <p className="font-mono text-xs font-semibold text-white break-all">
                  {item.name}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
              </div>

              <div className="self-start sm:self-auto shrink-0">
                {item.defined ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[11px] sm:text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Configurada
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[11px] sm:text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Ausente no .env
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
