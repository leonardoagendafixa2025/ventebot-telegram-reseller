"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/produtos", label: "Produtos", icon: Package },
  { href: "/dashboard/categorias", label: "Categorias", icon: Layers },
  { href: "/dashboard/pedidos", label: "Pedidos", icon: ShoppingBag },
  { href: "/dashboard/clientes", label: "Clientes", icon: Users },
  { href: "/dashboard/financeiro", label: "Financeiro", icon: DollarSign },
  {
    href: "/dashboard/integracoes/ventebot",
    label: "VenteBot API",
    icon: PlugZap,
    highlight: true,
  },
  { href: "/dashboard/canal", label: "Canal Telegram", icon: Radio },
  { href: "/dashboard/logs", label: "Auditoria & Logs", icon: FileText },
  { href: "/dashboard/configuracoes", label: "Configurações", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

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

  return (
    <aside className="w-64 flex-shrink-0 min-h-screen bg-[#090b17] border-r border-white/[0.07] flex flex-col justify-between p-4">
      <div>
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-3 py-4 mb-4 border-b border-white/[0.06]">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
            VB
          </div>
          <div>
            <h1 className="font-semibold text-sm tracking-wide text-white">
              VenteBot Reseller
            </h1>
            <p className="text-xs text-slate-400">Painel Administrativo</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm shadow-indigo-500/10"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
                } ${item.highlight && !isActive ? "text-violet-400" : ""}`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    isActive ? "text-indigo-400" : item.highlight ? "text-violet-400" : "text-slate-400"
                  }`}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer / User & Logout */}
      <div className="pt-4 border-t border-white/[0.06] space-y-2">
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02]">
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
          className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Sair da conta</span>
        </button>
      </div>
    </aside>
  );
}
