import { NextResponse } from "next/server";
import { OrderService } from "@/lib/services/order-service";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
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

    const orderService = new OrderService();
    const result = await orderService.reconcilePendingOrders();

    return NextResponse.json({
      success: true,
      reconciled_count: result.reconciled,
      errors: result.errors,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || "Erro na reconciliação de pedidos." },
      { status: 500 }
    );
  }
}
