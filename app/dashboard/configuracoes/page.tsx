import { createClient } from "@/lib/supabase/server";
import { Settings, CheckCircle2, AlertTriangle, ShieldCheck, Terminal } from "lucide-react";
import { TelegramBotClient } from "@/lib/telegram/client";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
          <Settings className="h-6 w-6 text-indigo-400" />
          <span>Configurações do Sistema</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Diagnóstico do ambiente de execução, variáveis de configuração e webhook do Telegram.
        </p>
      </div>

      {/* Ações Rápidas de Configuração do Telegram */}
      <div className="glass-panel rounded-2xl p-6 border border-white/[0.08]">
        <h3 className="font-semibold text-white text-base mb-2 flex items-center gap-2">
          <Terminal className="h-4 w-4 text-indigo-400" />
          <span>Configuração Automática do Webhook do Telegram</span>
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Registra o endpoint <code>/api/telegram/webhook</code> no Telegram com o segredo configurado e instala o menu de comandos oficial.
        </p>

        <form action={registerTelegramWebhook}>
          <button
            type="submit"
            className="py-2.5 px-4 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Configurar / Renovar Webhook Oficial</span>
          </button>
        </form>
      </div>

      {/* Checklist de Variáveis de Ambiente */}
      <div className="glass-panel rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="p-6 border-b border-white/[0.06]">
          <h3 className="font-semibold text-white text-base">
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
              className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
            >
              <div>
                <p className="font-mono text-xs font-semibold text-white">
                  {item.name}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
              </div>

              <div>
                {item.defined ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Configurada
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
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
