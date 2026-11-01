import { createClient } from "@/lib/supabase/server";
import { Users, ShieldAlert, ShieldCheck } from "lucide-react";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const supabase = await createClient();

  const { data: clientes } = await supabase
    .from("clientes")
    .select(`
      *,
      pedidos:pedidos(count)
    `)
    .order("created_at", { ascending: false });

  async function toggleBlockCliente(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const bloqueado = formData.get("bloqueado") === "true";

    const serverSupabase = await createClient();
    await serverSupabase
      .from("clientes")
      .update({ bloqueado: !bloqueado, updated_at: new Date().toISOString() })
      .eq("id", id);

    revalidatePath("/dashboard/clientes");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex flex-wrap items-center gap-2.5 sm:gap-3">
          <Users className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-400" />
          <span>Base de Clientes</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Usuários registrados que interagiram e compraram através do Bot do Telegram.
        </p>
      </div>

      <div className="glass-panel rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[650px]">
            <thead className="bg-slate-900/60 text-xs text-slate-400 border-b border-white/[0.06] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Telegram ID</th>
                <th className="px-6 py-4">Usuário / Nome</th>
                <th className="px-6 py-4">Saldo em Stars</th>
                <th className="px-6 py-4">Pedidos Realizados</th>
                <th className="px-6 py-4">Primeiro Acesso</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {clientes && clientes.length > 0 ? (
                clientes.map((cli: any) => (
                  <tr key={cli.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-indigo-300">
                      <code>{cli.telegram_id}</code>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-white">
                      <div>
                        <p>{cli.first_name || "Sem Nome"} {cli.last_name || ""}</p>
                        <p className="text-slate-400">
                          {cli.username ? `@${cli.username}` : "Sem @username"}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-semibold text-amber-300">
                      {cli.saldo_carteira_stars} ⭐
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-300">
                      {cli.pedidos?.[0]?.count || 0} compras
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {new Date(cli.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {cli.bloqueado ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                          <ShieldAlert className="h-3 w-3" />
                          Bloqueado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <ShieldCheck className="h-3 w-3" />
                          Ativo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <form action={toggleBlockCliente}>
                        <input type="hidden" name="id" value={cli.id} />
                        <input type="hidden" name="bloqueado" value={String(cli.bloqueado)} />
                        <button
                          type="submit"
                          className={`text-xs px-2.5 py-1 rounded transition-colors font-medium ${
                            cli.bloqueado
                              ? "text-emerald-400 hover:bg-emerald-500/10"
                              : "text-red-400 hover:bg-red-500/10"
                          }`}
                        >
                          {cli.bloqueado ? "Desbloquear" : "Bloquear"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-500 text-xs">
                    Nenhum cliente registrado ainda. Quando usuários iniciarem o bot pelo Telegram, eles serão listados aqui.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
