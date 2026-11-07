import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/orders/list?filtro=todos|pago|pendente|erro
 *
 * Lista pedidos do dashboard com filtro por status.
 * Restrito a usuários com role `admin` ou `superadmin`.
 */
export async function GET(req: NextRequest) {
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

    const filtro = req.nextUrl.searchParams.get("filtro") || "todos";

    let query = supabase
      .from("pedidos")
      .select(`
        id,
        referencia_unica,
        created_at,
        status_pagamento,
        status_fornecedor,
        status_entrega,
        conteudo_entregue,
        detalhes_falha,
        total_usd,
        quantidade,
        binance_tx_id,
        fornecedor_order_id,
        produto:produtos(nome, emoji),
        cliente:clientes(username, telegram_id)
      `)
      .order("created_at", { ascending: false })
      .limit(60);

    if (filtro === "pago") {
      query = query.eq("status_pagamento", "pago");
    } else if (filtro === "pendente") {
      query = query.eq("status_pagamento", "pendente");
    } else if (filtro === "erro") {
      query = query
        .eq("status_pagamento", "pago")
        .neq("status_entrega", "entregue")
        .in("status_fornecedor", ["fornecedor_erro", "fornecedor_status_desconhecido"]);
    }

    const { data: pedidos, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pedidos: pedidos || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Erro interno." },
      { status: 500 }
    );
  }
}
