import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/products/update
 * Body: { id: string, preco_venda_usd?: number, preco_venda_stars?: number, ativo?: boolean, destaque?: boolean }
 *
 * Atualiza preços e status de produtos no catálogo.
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
    const { id, preco_venda_usd, preco_venda_stars, ativo, destaque } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "ID do produto é obrigatório." }, { status: 400 });
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (preco_venda_usd !== undefined) {
      const preco = Number(preco_venda_usd);
      if (isNaN(preco) || preco < 0) {
        return NextResponse.json({ error: "Preço USD inválido." }, { status: 400 });
      }
      updates.preco_venda_usd = Number(preco.toFixed(2));
    }

    if (preco_venda_stars !== undefined) {
      const stars = Math.max(1, Math.round(Number(preco_venda_stars)));
      updates.preco_venda_stars = stars;
    }

    if (ativo !== undefined) {
      updates.ativo = Boolean(ativo);
    }

    if (destaque !== undefined) {
      updates.destaque = Boolean(destaque);
    }

    const { data: updatedProd, error: updateErr } = await supabase
      .from("produtos")
      .update(updates)
      .eq("id", id)
      .select("*, categoria:categorias(nome)")
      .single();

    if (updateErr) {
      throw updateErr;
    }

    return NextResponse.json({
      success: true,
      produto: updatedProd,
      message: "Produto atualizado com sucesso!",
    });
  } catch (err: any) {
    console.error("[API Products Update] Erro:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Erro ao atualizar produto." },
      { status: 500 }
    );
  }
}
