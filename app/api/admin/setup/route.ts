import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, bootstrap_secret } = body;

    const serverSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!serverSecret || !bootstrap_secret || bootstrap_secret !== serverSecret) {
      return NextResponse.json(
        { success: false, message: "Chave secreta de bootstrap incorreta ou não configurada." },
        { status: 403 }
      );
    }

    if (!email || !password || password.length < 8) {
      return NextResponse.json(
        { success: false, message: "Forneça email e senha válidos (mínimo 8 caracteres)." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Verifica se já existe algum admin configurado
    const { count, error: countErr } = await supabase
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .in("role", ["admin", "superadmin"]);

    if (countErr) {
      return NextResponse.json(
        { success: false, message: `Erro ao verificar admins: ${countErr.message}` },
        { status: 500 }
      );
    }

    if (count && count > 0) {
      return NextResponse.json(
        {
          success: false,
          message: "O sistema já possui um administrador cadastrado. Cadastro público bloqueado.",
        },
        { status: 403 }
      );
    }

    // Cria o usuário no Supabase Auth via admin API
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authErr) {
      return NextResponse.json(
        { success: false, message: `Falha ao criar usuário de autenticação: ${authErr.message}` },
        { status: 400 }
      );
    }

    const userId = authUser.user.id;

    // Registra como superadmin
    const { error: roleErr } = await supabase.from("user_roles").insert({
      user_id: userId,
      role: "superadmin",
    });

    if (roleErr) {
      return NextResponse.json(
        { success: false, message: `Falha ao associar papel: ${roleErr.message}` },
        { status: 500 }
      );
    }

    // Registra log de auditoria
    await supabase.from("logs_auditoria").insert({
      usuario_id: userId,
      acao: "BOOTSTRAP_PRIMEIRO_ADMIN",
      entidade: "user_roles",
      entidade_id: userId,
      detalhes: { email },
    });

    return NextResponse.json({
      success: true,
      message: "Primeiro superadministrador criado com sucesso! Faça login no painel.",
      user: { id: userId, email },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || "Erro interno no setup." },
      { status: 500 }
    );
  }
}
