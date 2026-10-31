import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderService } from "@/lib/services/order-service";
import * as adminModule from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => {
  return {
    createAdminClient: vi.fn(),
  };
});

describe("OrderService - Ciclo de Vida e Segurança de Pedidos", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("deve rejeitar reprocessamento de pagamento já confirmado (idempotência)", async () => {
    const mockSupabaseAdmin = {
      rpc: vi.fn().mockResolvedValue({
        data: { success: true, status: "ja_processado", message: "Transação já processada" },
        error: null,
      }),
      from: vi.fn(),
    };

    vi.spyOn(adminModule, "createAdminClient").mockReturnValue(mockSupabaseAdmin as any);

    const service = new OrderService();
    const result = await service.handlePaymentConfirmation({
      pedidoId: "ped-123",
      provedor: "telegram_stars",
      referenciaExterna: "charge_999",
      valorStars: 100,
      payloadSeguro: {},
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("já processado");
    expect(mockSupabaseAdmin.from).not.toHaveBeenCalled();
  });

  it("deve congelar preço e dados no momento da criação do pedido", async () => {
    const mockSupabaseAdmin = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          success: true,
          pedido_id: "ped-uuid-1",
          referencia_unica: "ORD-20261031-12345678",
          total_usd: 13.0,
          total_stars: 650,
          idempotency_key: "ventebot-ORD-20261031-12345678",
          produto_nome: "Grok 1 month",
        },
        error: null,
      }),
    };

    vi.spyOn(adminModule, "createAdminClient").mockReturnValue(mockSupabaseAdmin as any);

    const service = new OrderService();
    const order = await service.createOrder({
      telegramId: 987654321,
      produtoId: "prod-uuid",
      quantidade: 1,
    });

    expect(order.referencia_unica).toBe("ORD-20261031-12345678");
    expect(order.total_stars).toBe(650);
    expect(order.idempotency_key).toContain("ventebot-ORD-");
  });
});
