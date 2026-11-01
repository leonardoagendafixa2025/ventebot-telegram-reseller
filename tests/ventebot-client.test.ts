import { describe, it, expect, vi, beforeEach } from "vitest";
import { VenteBotClient } from "../lib/ventebot/client";

describe("VenteBotClient - Integração com Fornecedor Oficial", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("deve enviar o cabeçalho X-Reseller-Key e consultar saldo com sucesso", async () => {
    const mockMeResponse = {
      success: true,
      user_telegram_id: 123456789,
      username: "reseller_bot",
      first_name: "Batman Reseller",
      wallet_balance: 150.5,
      key_name: "Chave Producao",
      key_prefix: "vb123",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify(mockMeResponse),
    });

    const client = new VenteBotClient("minha_chave_secreta", "https://api.test.com");
    const result = await client.getBalance();

    expect(result.balance_usd).toBe(150.5);
    expect(result.user_telegram_id).toBe(123456789);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.test.com/api/reseller/me",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "X-Reseller-Key": "minha_chave_secreta",
        }),
      })
    );
  });

  it("deve desempacotar produtos quando a API retornar { success: true, products: [...] }", async () => {
    const mockProductsResponse = {
      success: true,
      products: [
        { id: 1, name: "Produto 1", price_usd: 10, stock: 5 },
        { id: 2, name: "Produto 2", price_usd: 20, stock: 0 },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify(mockProductsResponse),
    });

    const client = new VenteBotClient("minha_chave_secreta", "https://api.test.com");
    const prods = await client.getProducts();

    expect(Array.isArray(prods)).toBe(true);
    expect(prods.length).toBe(2);
    expect(prods[0].name).toBe("Produto 1");
  });

  it("deve impedir criação de pedido sem retries cegos quando fornecedor falha", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      text: async () =>
        JSON.stringify({
          success: false,
          code: "INSUFFICIENT_BALANCE",
          message: "Saldo insuficiente na carteira do fornecedor.",
        }),
    });

    const client = new VenteBotClient("minha_chave_secreta", "https://api.test.com");

    await expect(
      client.createOrder({
        product_id: 12,
        quantity: 1,
        idempotency_key: "idem-123",
      })
    ).rejects.toThrow("Saldo insuficiente na carteira do fornecedor.");

    // Apenas 1 chamada: nunca retentar criação de compra cegamente
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("deve sanitizar senhas e dados confidenciais nos payloads de log", () => {
    const client = new VenteBotClient("secret_key");
    const payload = {
      username: "user1",
      password: "super_secret_password",
      account_data: "login:password123",
      other: "normal",
    };

    const sanitized = (client as any).sanitizePayload(payload);
    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.account_data).toBe("[REDACTED]");
    expect(sanitized.username).toBe("user1");
    expect(sanitized.other).toBe("normal");
  });
});
