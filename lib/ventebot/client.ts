import {
  SupplierProvider,
  VenteBotCreateOrderRequest,
  VenteBotCreateOrderResponse,
  VenteBotError,
  VenteBotMeResponse,
  VenteBotOrder,
  VenteBotProduct,
  VenteBotQuoteResponse,
  VenteBotWalletTransaction,
} from "./types";
import { createAdminClient } from "@/lib/supabase/admin";

export class VenteBotClient implements SupplierProvider {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;

  constructor(apiKey?: string, baseUrl?: string, timeoutMs = 15000) {
    this.apiKey = apiKey || process.env.VENTEBOT_RESELLER_KEY || "";
    this.baseUrl = (
      baseUrl ||
      process.env.VENTEBOT_BASE_URL ||
      "https://web-production-1c7b1.up.railway.app"
    ).replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
  }

  public hasKey(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  private sanitizePayload(data: unknown): unknown {
    if (!data || typeof data !== "object") return data;
    const copy = JSON.parse(JSON.stringify(data));
    const hideKeys = ["password", "secret", "token", "key", "api_key", "account_data"];
    
    function redact(obj: Record<string, unknown>) {
      for (const k of Object.keys(obj)) {
        if (hideKeys.some((h) => k.toLowerCase().includes(h))) {
          obj[k] = "[REDACTED]";
        } else if (typeof obj[k] === "object" && obj[k] !== null) {
          redact(obj[k] as Record<string, unknown>);
        }
      }
    }
    redact(copy);
    return copy;
  }

  private async logEvent(params: {
    pedidoId?: string;
    acao: string;
    endpoint: string;
    payload?: unknown;
    resposta?: unknown;
    statusHttp?: number;
    sucesso: boolean;
    mensagemErro?: string;
    tempoExecucaoMs: number;
  }) {
    try {
      const supabase = createAdminClient();
      await supabase.from("fornecedor_eventos").insert({
        pedido_id: params.pedidoId || null,
        acao: params.acao,
        endpoint: params.endpoint,
        payload_sanitizado: this.sanitizePayload(params.payload),
        resposta_sanitizada: this.sanitizePayload(params.resposta),
        status_http: params.statusHttp || null,
        sucesso: params.sucesso,
        mensagem_erro: params.mensagemErro || null,
        tempo_execucao_ms: params.tempoExecucaoMs,
      });
    } catch (e) {
      // Falha de log não deve quebrar o fluxo crítico
      console.error("[VenteBot] Falha ao gravar log no banco:", e);
    }
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: unknown;
      pedidoId?: string;
      acao: string;
      retries?: number;
    }
  ): Promise<T> {
    if (!this.hasKey()) {
      throw new Error(
        "VENTEBOT_RESELLER_KEY não configurada no ambiente. Conecte sua chave no painel ou no .env.local."
      );
    }

    const url = `${this.baseUrl}${endpoint}`;
    const method = options.method || "GET";
    const startTime = Date.now();
    let statusHttp = 0;
    let retries = options.retries ?? 1;

    while (retries >= 0) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const headers: Record<string, string> = {
          "Accept": "application/json",
          "X-Reseller-Key": this.apiKey,
        };

        if (options.body) {
          headers["Content-Type"] = "application/json";
        }

        const res = await fetch(url, {
          method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        statusHttp = res.status;
        const duration = Date.now() - startTime;

        let json: unknown;
        const text = await res.text();
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          json = { raw: text };
        }

        if (!res.ok) {
          const errData = json as VenteBotError;
          const errMsg =
            errData?.message ||
            `Erro HTTP ${res.status} ao comunicar com a VenteBot API`;

          // Se for erro 429 ou 503 temporário e ainda houver tentativa
          if ((res.status === 429 || res.status === 503) && retries > 0) {
            retries--;
            const retryAfter = Number(res.headers.get("Retry-After")) || 2;
            await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
            continue;
          }

          await this.logEvent({
            pedidoId: options.pedidoId,
            acao: options.acao,
            endpoint,
            payload: options.body,
            resposta: json,
            statusHttp,
            sucesso: false,
            mensagemErro: errMsg,
            tempoExecucaoMs: duration,
          });

          const error = new Error(errMsg);
          (error as unknown as { code?: string; status?: number }).code = errData?.code;
          (error as unknown as { code?: string; status?: number }).status = res.status;
          throw error;
        }

        await this.logEvent({
          pedidoId: options.pedidoId,
          acao: options.acao,
          endpoint,
          payload: options.body,
          resposta: json,
          statusHttp,
          sucesso: true,
          tempoExecucaoMs: duration,
        });

        return json as T;
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        const isAbort = (err as Error).name === "AbortError";
        const message = isAbort
          ? `Timeout de ${this.timeoutMs}ms excedido na requisição para ${endpoint}`
          : (err as Error).message;

        if (retries > 0 && !isAbort) {
          retries--;
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }

        await this.logEvent({
          pedidoId: options.pedidoId,
          acao: options.acao,
          endpoint,
          payload: options.body,
          resposta: null,
          statusHttp: statusHttp || (isAbort ? 408 : 500),
          sucesso: false,
          mensagemErro: message,
          tempoExecucaoMs: duration,
        });

        throw new Error(message);
      }
    }

    throw new Error("Falha na comunicação após tentativas excedidas.");
  }

  /**
   * GET /api/reseller/me - Valida a chave e retorna o saldo da carteira do revendedor
   */
  async getBalance(): Promise<{
    balance_usd: number;
    user_telegram_id: number;
    key_name: string;
    username: string | null;
  }> {
    const res = await this.request<VenteBotMeResponse>("/api/reseller/me", {
      acao: "check_balance",
    });

    return {
      balance_usd: res.wallet_balance,
      user_telegram_id: res.user_telegram_id,
      key_name: res.key_name,
      username: res.username,
    };
  }

  /**
   * GET /api/reseller/products - Lista todos os produtos ativos do catálogo oficial
   */
  async getProducts(): Promise<VenteBotProduct[]> {
    const res = await this.request<VenteBotProduct[]>("/api/reseller/products", {
      acao: "sync_products",
    });
    return res;
  }

  /**
   * POST /api/reseller/quote - Calcula a cotação oficial do fornecedor antes da compra
   */
  async getQuote(
    productId: number,
    quantity = 1
  ): Promise<VenteBotQuoteResponse["quote"]> {
    const res = await this.request<VenteBotQuoteResponse>("/api/reseller/quote", {
      method: "POST",
      body: {
        product_id: productId,
        quantity,
      },
      acao: "quote",
    });
    return res.quote;
  }

  /**
   * POST /api/reseller/orders - Cria pedido de compra com chave de idempotência
   */
  async createOrder(
    params: VenteBotCreateOrderRequest,
    pedidoInternoId?: string
  ): Promise<VenteBotCreateOrderResponse> {
    return await this.request<VenteBotCreateOrderResponse>("/api/reseller/orders", {
      method: "POST",
      body: params,
      pedidoId: pedidoInternoId,
      acao: "create_order",
      retries: 0, // Nunca retentar cegamente criação de pedido para evitar duplicidade
    });
  }

  /**
   * GET /api/reseller/orders/{order_id} - Consulta status e itens entregues
   */
  async getOrder(orderId: number, pedidoInternoId?: string): Promise<VenteBotOrder> {
    const res = await this.request<{ success: boolean; order: VenteBotOrder }>(
      `/api/reseller/orders/${orderId}`,
      {
        pedidoId: pedidoInternoId,
        acao: "check_order",
      }
    );
    return res.order;
  }

  /**
   * POST /api/reseller/orders/{order_id}/activation-identifier - Submete identificador posterior
   */
  async submitActivationIdentifier(
    orderId: number,
    identifier: string,
    pedidoInternoId?: string
  ): Promise<VenteBotOrder> {
    const res = await this.request<{ success: boolean; order: VenteBotOrder }>(
      `/api/reseller/orders/${orderId}/activation-identifier`,
      {
        method: "POST",
        body: { activation_identifier: identifier },
        pedidoId: pedidoInternoId,
        acao: "submit_activation",
      }
    );
    return res.order;
  }

  /**
   * GET /api/reseller/wallet/transactions - Histórico de transações da carteira do fornecedor
   */
  async getWalletTransactions(): Promise<VenteBotWalletTransaction[]> {
    return await this.request<VenteBotWalletTransaction[]>(
      "/api/reseller/wallet/transactions",
      {
        acao: "wallet_transactions",
      }
    );
  }
}
