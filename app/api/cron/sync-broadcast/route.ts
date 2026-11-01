import { NextRequest, NextResponse } from "next/server";
import { SyncService } from "@/lib/services/sync-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const isVercelCron = req.headers.get("x-vercel-cron") === "1";
    const secretParam = req.nextUrl.searchParams.get("secret");

    const cronSecret = process.env.CRON_SECRET;
    const bootstrapSecret = process.env.ADMIN_BOOTSTRAP_SECRET || "admin_super_secret_setup_2026";

    // Validação de segurança para chamadas externas não autorizadas
    const authorized =
      isVercelCron ||
      (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
      secretParam === bootstrapSecret;

    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const forceFeatured = req.nextUrl.searchParams.get("force_featured") === "true";

    const syncService = new SyncService();
    const result = await syncService.syncCatalog({
      broadcastAlerts: true,
      forceFeaturedIfQuiet: forceFeatured,
    });

    return NextResponse.json({
      success: true,
      executed_at: new Date().toISOString(),
      result,
    });
  } catch (err: any) {
    console.error("[Cron Sync Broadcast] Erro na execução:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Erro desconhecido durante execução da cron.",
      },
      { status: 500 }
    );
  }
}
