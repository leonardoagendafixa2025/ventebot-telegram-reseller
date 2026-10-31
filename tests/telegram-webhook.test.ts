import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../app/api/telegram/webhook/route";
import { NextRequest } from "next/server";

vi.mock("../lib/supabase/admin", () => {
  return {
    createAdminClient: () => ({
      rpc: vi.fn(),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "uuid-1", total_stars: 100, status_pagamento: "pendente" },
            }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  };
});

describe("Telegram Webhook - Segurança e Validação de Pagamentos Stars", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("deve retornar 401 Unauthorized se o secret token do webhook for inválido", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "segredo_super_seguro_123";

    const req = new NextRequest("https://app.com/api/telegram/webhook", {
      method: "POST",
      headers: {
        "x-telegram-bot-api-secret-token": "token_errado",
      },
      body: JSON.stringify({ update_id: 1 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("deve validar pre_checkout_query e aprovar quando Stars e Pedido conferem", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "segredo_123";
    process.env.TELEGRAM_BOT_TOKEN = "mock_token";

    // Mock fetch para Telegram API
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: true }),
    });

    const req = new NextRequest("https://app.com/api/telegram/webhook", {
      method: "POST",
      headers: {
        "x-telegram-bot-api-secret-token": "segredo_123",
      },
      body: JSON.stringify({
        update_id: 100,
        pre_checkout_query: {
          id: "pcq_123",
          from: { id: 999, first_name: "John", is_bot: false },
          currency: "XTR",
          total_amount: 100,
          invoice_payload: "order_uuid-1",
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    // Valida se chamou answerPreCheckoutQuery com ok: true
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("answerPreCheckoutQuery"),
      expect.objectContaining({
        body: JSON.stringify({
          pre_checkout_query_id: "pcq_123",
          ok: true,
        }),
      })
    );
  });
});
