import { NextRequest, NextResponse } from "next/server";
import { OrderService } from "@/lib/services/order-service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/orders/cancel
 * Body: { pedidoId: string, motivo?: string }
 *
 * Cancela um pedido manualmente.
 * Restrito a administradores.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!roleData || !["admin", "superadmin"].includes(roleData.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { pedidoId, motivo } = body;

    if (!pedidoId || typeof pedidoId !== "string") {
      return NextResponse.json({ error: "pedidoId é obrigatório." }, { status: 400 });
    }

    const orderService = new OrderService();
    const result = await orderService.cancelOrder(pedidoId, motivo);

    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (err: any) {
    console.error("[API Orders Cancel] Erro:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Erro interno ao cancelar pedido." },
      { status: 500 }
    );
  }
}
