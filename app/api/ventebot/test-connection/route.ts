import { NextResponse } from "next/server";
import { VenteBotClient } from "@/lib/ventebot/client";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    // 1. Validar autenticação do usuário administrador via sessão do Supabase
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { success: false, message: "Acesso não autorizado. Faça login como administrador." },
        { status: 401 }
      );
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!roleData || !["admin", "superadmin"].includes(roleData.role)) {
      return NextResponse.json(
        { success: false, message: "Permissão insuficiente para testar a integração." },
        { status: 403 }
      );
    }

    // 2. Chamar a API oficial da VenteBot
    const client = new VenteBotClient();
    if (!client.hasKey()) {
      return NextResponse.json(
        {
          success: false,
          connected: false,
          message: "Chave VENTEBOT_RESELLER_KEY não encontrada no ambiente do servidor.",
        },
        { status: 400 }
      );
    }

    const startTime = Date.now();
    const info = await client.getBalance();
    const latency = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      connected: true,
      latency_ms: latency,
      wallet_balance_usd: info.balance_usd,
      user_telegram_id: info.user_telegram_id,
      key_name: info.key_name,
      username: info.username,
      message: `Conexão estabelecida com sucesso! Saldo atual na VenteBot: $${info.balance_usd.toFixed(2)} USD`,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        connected: false,
        message: err.message || "Falha ao conectar à VenteBot Reseller API.",
      },
      { status: 500 }
    );
  }
}
