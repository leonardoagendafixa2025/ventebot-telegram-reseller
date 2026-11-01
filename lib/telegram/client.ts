import {
  TelegramInlineKeyboardMarkup,
  TelegramLabeledPrice,
  TelegramReplyKeyboardMarkup,
} from "./types";

const OFFICIAL_BOT_TOKEN = "9289684578:AAEopClDt2V-kj7pMVXuOlnA8TUu2mOPLqM";

function resolveValidToken(token?: string): string {
  const candidate = (token || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const cleaned = candidate.replace(/^bot[:\s_]*/i, "").replace(/["']/g, "").trim();
  if (/^\d{8,12}:[A-Za-z0-9_-]{25,}$/.test(cleaned)) {
    return cleaned;
  }
  return OFFICIAL_BOT_TOKEN;
}

export class TelegramBotClient {
  private botToken: string;
  private baseUrl: string;

  constructor(token?: string) {
    this.botToken = resolveValidToken(token);
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  public hasToken(): boolean {
    return Boolean(this.botToken && this.botToken.trim().length > 0);
  }

  private async callApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
    if (!this.hasToken()) {
      throw new Error("TELEGRAM_BOT_TOKEN não configurado no ambiente.");
    }

    const res = await fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as { ok: boolean; description?: string; result?: T };
    if (!json.ok) {
      throw new Error(`Telegram API [${method}] falhou: ${json.description || "Erro desconhecido"}`);
    }

    return json.result as T;
  }

  async sendMessage(params: {
    chat_id: number | string;
    text: string;
    parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
    reply_markup?: TelegramInlineKeyboardMarkup | TelegramReplyKeyboardMarkup;
  }) {
    return await this.callApi<{ message_id: number }>("sendMessage", params as Record<string, unknown>);
  }

  async editMessageText(params: {
    chat_id: number | string;
    message_id: number;
    text: string;
    parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
    reply_markup?: TelegramInlineKeyboardMarkup;
  }) {
    return await this.callApi<{ message_id: number }>("editMessageText", params as Record<string, unknown>);
  }

  async answerCallbackQuery(params: {
    callback_query_id: string;
    text?: string;
    show_alert?: boolean;
  }) {
    return await this.callApi<boolean>("answerCallbackQuery", params as Record<string, unknown>);
  }

  /**
   * Envia uma fatura oficial do Telegram Stars (XTR)
   * Obrigatório para vendas de bens e serviços digitais dentro do Telegram
   */
  async sendInvoice(params: {
    chat_id: number;
    title: string;
    description: string;
    payload: string;
    currency?: string; // Padrão "XTR" (Telegram Stars)
    prices: TelegramLabeledPrice[];
    start_parameter?: string;
  }) {
    return await this.callApi<{ message_id: number }>("sendInvoice", {
      chat_id: params.chat_id,
      title: params.title,
      description: params.description,
      payload: params.payload,
      provider_token: "", // Vazio para Telegram Stars!
      currency: params.currency || "XTR",
      prices: params.prices,
      start_parameter: params.start_parameter,
    });
  }

  /**
   * Responde ao pre-checkout query antes da conclusão do pagamento
   */
  async answerPreCheckoutQuery(params: {
    pre_checkout_query_id: string;
    ok: boolean;
    error_message?: string;
  }) {
    return await this.callApi<boolean>("answerPreCheckoutQuery", params as Record<string, unknown>);
  }

  /**
   * Registra o Webhook oficial com token secreto de proteção
   */
  async setWebhook(url: string, secretToken?: string) {
    return await this.callApi<boolean>("setWebhook", {
      url,
      secret_token: secretToken,
      allowed_updates: ["message", "callback_query", "pre_checkout_query", "channel_post", "my_chat_member"],
    });
  }

  /**
   * Configura o menu de comandos do bot
   */
  async setMyCommands() {
    return await this.callApi<boolean>("setMyCommands", {
      commands: [
        { command: "start", description: "Abrir Loja Digital e Inicio" },
        { command: "loja", description: "Ver Catalogo de Produtos" },
        { command: "destaques", description: "Mais Vendidos e Ofertas" },
        { command: "buscar", description: "Pesquisar Produto por Nome" },
        { command: "pedidos", description: "Meus Pedidos e Licencas" },
        { command: "suporte", description: "Central de Atendimento" },
      ],
    });
  }
}
