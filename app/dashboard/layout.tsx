import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";

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
    <div className="flex min-h-screen bg-[#070812] text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-white/[0.07] bg-[#090b17]/80 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/20">
              Admin Seguro
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs font-medium text-slate-200">{user.email}</p>
              <p className="text-[11px] text-slate-400">Super Administrador</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-300">
              {user.email ? user.email.slice(0, 2).toUpperCase() : "AD"}
            </div>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-y-auto max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
