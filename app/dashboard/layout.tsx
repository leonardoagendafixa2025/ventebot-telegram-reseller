import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user = null;
  let isAdmin = false;

  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    user = authData?.user;

    if (user) {
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      isAdmin = Boolean(roleData && ["admin", "superadmin"].includes(roleData.role));
    }
  } catch (e) {
    console.error("[DashboardLayout] Erro ao validar sessão admin:", e);
  }

  // Se não estiver logado como admin em produção/acesso real, redireciona para login
  if (!user || !isAdmin) {
    redirect("/login");
  }

  return (
    <DashboardShell userEmail={user.email}>
      {children}
    </DashboardShell>
  );
}
