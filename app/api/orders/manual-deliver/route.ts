import { NextRequest, NextResponse } from "next/server";
import { OrderService } from "@/lib/services/order-service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/orders/manual-deliver
 * Body: { pedidoId: string, conteudo: string }
 *
 * Realiza a entrega manual de credenciais/acesso e notifica o cliente no Telegram.
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
    const { pedidoId, conteudo } = body;

    if (!pedidoId || typeof pedidoId !== "string") {
      return NextResponse.json({ error: "pedidoId é obrigatório." }, { status: 400 });
    }

    if (!conteudo || typeof conteudo !== "string" || !conteudo.trim()) {
      return NextResponse.json(
        { error: "Conteúdo da entrega não pode ser vazio." },
        { status: 400 }
      );
    }

    const orderService = new OrderService();
    const result = await orderService.manualDeliver(pedidoId, conteudo);

    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (err: any) {
    console.error("[API Orders Manual Deliver] Erro:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Erro interno na entrega manual." },
      { status: 500 }
    );
  }
}
