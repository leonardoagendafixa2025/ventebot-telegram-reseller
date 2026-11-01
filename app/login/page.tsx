"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { ShieldCheck, Lock, Mail, KeyRound, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Setup de bootstrap do primeiro admin
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const [bootstrapEmail, setBootstrapEmail] = useState("");
  const [bootstrapPassword, setBootstrapPassword] = useState("");
  const [bootstrapLoading, setBootstrapLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(`Falha no login: ${error.message}`);
        return;
      }

      toast.success("Autenticado com sucesso! Redirecionando...");
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado ao conectar.");
    } finally {
      setLoading(false);
    }
  }

  async function handleBootstrap(e: React.FormEvent) {
    e.preventDefault();
    setBootstrapLoading(true);

    try {
      const res = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: bootstrapEmail,
          password: bootstrapPassword,
          bootstrap_secret: bootstrapSecret,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Falha no setup de administrador.");
        return;
      }

      toast.success("Primeiro administrador cadastrado com sucesso! Faça login.");
      setEmail(bootstrapEmail);
      setPassword(bootstrapPassword);
      setShowBootstrap(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao executar setup.");
    } finally {
      setBootstrapLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#070812] flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Decorative background glows */}
      <div className="absolute top-1/4 left-1/3 w-72 sm:w-96 h-72 sm:h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-72 sm:w-96 h-72 sm:h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-xl shadow-indigo-500/25 mb-3 sm:mb-4">
            <ShieldCheck className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            VenteBot Reseller Admin
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Painel Administrativo Privado e Autônomo
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5 sm:p-7 shadow-2xl shadow-black/50 border border-white/[0.08]">
          {!showBootstrap ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email do Administrador
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@seudominio.com"
                    className="w-full pl-10 pr-4 py-3 sm:py-2.5 bg-slate-900/60 border border-white/[0.09] rounded-xl text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-3 sm:py-2.5 bg-slate-900/60 border border-white/[0.09] rounded-xl text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50"
              >
                {loading ? "Autenticando..." : "Entrar no Painel"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleBootstrap} className="space-y-4">
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl mb-3">
                <p className="text-xs text-indigo-300">
                  <b>Bootstrap Seguro:</b> Registre o primeiro superadmin usando a chave configurada no <code>.env</code> (ADMIN_BOOTSTRAP_SECRET).
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Chave Secreta de Bootstrap
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={bootstrapSecret}
                    onChange={(e) => setBootstrapSecret(e.target.value)}
                    placeholder="ADMIN_BOOTSTRAP_SECRET"
                    className="w-full pl-10 pr-4 py-3 sm:py-2.5 bg-slate-900/60 border border-white/[0.09] rounded-xl text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email para o Primeiro Admin
                </label>
                <input
                  type="email"
                  required
                  value={bootstrapEmail}
                  onChange={(e) => setBootstrapEmail(e.target.value)}
                  placeholder="admin@seusite.com"
                  className="w-full px-4 py-3 sm:py-2.5 bg-slate-900/60 border border-white/[0.09] rounded-xl text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Senha Forte (mínimo 8 dígitos)
                </label>
                <input
                  type="password"
                  required
                  value={bootstrapPassword}
                  onChange={(e) => setBootstrapPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 sm:py-2.5 bg-slate-900/60 border border-white/[0.09] rounded-xl text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={bootstrapLoading}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all disabled:opacity-50"
              >
                {bootstrapLoading ? "Criando Admin..." : "Configurar Primeiro Admin"}
              </button>
            </form>
          )}

          <div className="mt-5 sm:mt-6 pt-4 sm:pt-5 border-t border-white/[0.06] text-center">
            <button
              type="button"
              onClick={() => setShowBootstrap(!showBootstrap)}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {showBootstrap
                ? "← Voltar para tela de login"
                : "Primeiro acesso? Inicializar Primeiro Administrador"}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-5 sm:mt-6">
          Acesso restrito exclusivamente a administradores autorizados.
        </p>
      </div>
    </div>
  );
}
