"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Layers,
  ShoppingBag,
  Users,
  DollarSign,
  Radio,
  FileText,
  Settings,
  PlugZap,
  LogOut,
  Menu,
  X,
  MoreHorizontal,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export interface NavItem {
  href: string;
  label: string;
  icon: any;
  highlight?: boolean;
}

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/produtos", label: "Produtos", icon: Package },
  { href: "/dashboard/pedidos", label: "Pedidos", icon: ShoppingBag },
  { href: "/dashboard/canal", label: "Canal Telegram", icon: Radio },
  { href: "/dashboard/categorias", label: "Categorias", icon: Layers },
  { href: "/dashboard/clientes", label: "Clientes", icon: Users },
  { href: "/dashboard/financeiro", label: "Financeiro", icon: DollarSign },
  {
    href: "/dashboard/integracoes/ventebot",
    label: "VenteBot API",
    icon: PlugZap,
    highlight: true,
  },
  { href: "/dashboard/logs", label: "Auditoria & Logs", icon: FileText },
  { href: "/dashboard/configuracoes", label: "Configurações", icon: Settings },
];

export function DashboardShell({
  userEmail,
  children,
}: {
  userEmail?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Fecha o menu mobile ao navegar
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Previne rolagem do body quando o drawer estiver aberto no mobile
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  // Fecha no ESC
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileMenuOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleLogout() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      toast.success("Sessão finalizada com sucesso.");
      router.push("/login");
    } catch {
      router.push("/login");
    }
  }

  const userInitials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "AD";

  // Itens da barra inferior no mobile
  const bottomNavItems = [
    { href: "/dashboard", label: "Início", icon: LayoutDashboard },
    { href: "/dashboard/produtos", label: "Produtos", icon: Package },
    { href: "/dashboard/pedidos", label: "Pedidos", icon: ShoppingBag },
    { href: "/dashboard/canal", label: "Canal", icon: Radio },
  ];

  return (
    <div className="flex min-h-screen bg-[#070812] text-slate-100">
      {/* ================================================================= */}
      {/* 1. SIDEBAR DESKTOP (Fixo em telas >= lg)                           */}
      {/* ================================================================= */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 h-screen sticky top-0 bg-[#090b17] border-r border-white/[0.07] flex-col justify-between p-4 z-20">
        <div className="flex flex-col h-full overflow-hidden">
          {/* Brand Header */}
          <div className="flex items-center gap-3 px-3 py-4 mb-3 border-b border-white/[0.06] flex-shrink-0">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
              VB
            </div>
            <div>
              <h1 className="font-semibold text-sm tracking-wide text-white">
                VenteBot Reseller
              </h1>
              <p className="text-[11px] text-slate-400">Painel Administrativo</p>
            </div>
          </div>

          {/* Navigation Items (com scroll suave se necessário) */}
          <nav className="space-y-1 overflow-y-auto flex-1 pr-1 custom-scrollbar">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm shadow-indigo-500/10 font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
                  } ${item.highlight && !isActive ? "text-violet-400 font-medium" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`h-4 w-4 ${
                        isActive
                          ? "text-indigo-400"
                          : item.highlight
                          ? "text-violet-400"
                          : "text-slate-400"
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Footer / User & Logout */}
          <div className="pt-3 border-t border-white/[0.06] space-y-2 flex-shrink-0 mt-auto">
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs text-slate-300 font-medium">Bot Online</span>
              </div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                V1.2
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>Sair da conta</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ================================================================= */}
      {/* 2. DRAWER MOBILE / SLIDE-OVER (< lg)                              */}
      {/* ================================================================= */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
          />

          {/* Slide-over Drawer */}
          <div className="fixed inset-y-0 left-0 w-80 max-w-[85vw] bg-[#090b17] border-r border-white/[0.1] shadow-2xl z-50 flex flex-col justify-between p-5 animate-in slide-in-from-left duration-200">
            <div>
              {/* Header do Drawer */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-500/20">
                    VB
                  </div>
                  <div>
                    <h2 className="font-semibold text-sm text-white">VenteBot Reseller</h2>
                    <p className="text-[11px] text-slate-400 truncate max-w-[150px]">
                      {userEmail || "Admin Seguro"}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="h-10 w-10 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                  aria-label="Fechar menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Links de Navegação Mobile */}
              <nav className="space-y-1.5 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
                {navItems.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                        isActive
                          ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-semibold"
                          : "text-slate-300 hover:text-white hover:bg-white/[0.04]"
                      } ${item.highlight && !isActive ? "text-violet-400" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon
                          className={`h-4 w-4 ${
                            isActive
                              ? "text-indigo-400"
                              : item.highlight
                              ? "text-violet-400"
                              : "text-slate-400"
                          }`}
                        />
                        <span>{item.label}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-600" />
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Footer Mobile */}
            <div className="pt-4 border-t border-white/[0.08] space-y-3">
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-xs text-slate-300 font-medium">Bot Online</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">v1.2</span>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm text-red-400 bg-red-500/10 hover:bg-red-500/20 font-medium transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span>Sair da conta</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 3. CONTEÚDO PRINCIPAL (HEADER + MAIN + BOTTOM NAV MOBILE)        */}
      {/* ================================================================= */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* HEADER RESPONSIVO */}
        <header className="h-16 border-b border-white/[0.07] bg-[#090b17]/80 backdrop-blur-md px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30">
          {/* Lado Esquerdo: Hamburger no Mobile / Badge no Desktop */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden h-10 w-10 flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors -ml-1.5"
              aria-label="Abrir menu de navegação"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2">
              <div className="lg:hidden h-7 w-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-white text-xs shadow-md shadow-indigo-500/20">
                VB
              </div>
              <span className="text-xs uppercase tracking-wider font-semibold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/20 hidden xs:inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3 w-3" />
                <span>Admin Seguro</span>
              </span>
            </div>
          </div>

          {/* Lado Direito: Identificação do Usuário */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-medium text-slate-200 truncate max-w-[200px]">
                {userEmail || "Administrador"}
              </p>
              <p className="text-[11px] text-slate-400">Super Administrador</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-indigo-600/30 to-violet-600/30 border border-indigo-500/40 flex items-center justify-center text-xs font-bold text-indigo-300 shadow-sm shadow-indigo-500/20">
              {userInitials}
            </div>
          </div>
        </header>

        {/* ÁREA DE CONTEÚDO COM PADDING MOBILE-FIRST */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 overflow-y-auto max-w-7xl w-full mx-auto">
          {children}
        </main>

        {/* ================================================================= */}
        {/* 4. BARRA DE NAVEGAÇÃO INFERIOR NO MOBILE (lg:hidden)               */}
        {/* ================================================================= */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 h-16 bg-[#090b17]/95 backdrop-blur-xl border-t border-white/[0.08] z-40 flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]">
          {bottomNavItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-medium transition-all ${
                  isActive ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <div
                  className={`p-1 rounded-xl transition-all ${
                    isActive ? "bg-indigo-600/20" : ""
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className="mt-0.5">{item.label}</span>
              </Link>
            );
          })}

          {/* Botão Menu Completo (Abre o Drawer) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-medium text-slate-400 hover:text-slate-200 transition-all"
          >
            <div className="p-1 rounded-xl">
              <MoreHorizontal className="h-4 w-4" />
            </div>
            <span className="mt-0.5">Mais</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
