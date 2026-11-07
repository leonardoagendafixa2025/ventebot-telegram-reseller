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

  async function addCredit(formData: FormData) {
    "use server";
    const clienteId = formData.get("clienteId") as string;
    const valorUsd = parseFloat(formData.get("valorUsd") as string) || 0;
    if (valorUsd <= 0) return;

    const stars = Math.round(valorUsd * 50);
    const serverSupabase = await createClient();
    await serverSupabase.rpc("movimentar_carteira_atomicamente", {
      p_cliente_id: clienteId,
      p_tipo: "credito",
      p_valor_stars: stars,
      p_descricao: `Crédito manual via painel admin ($${valorUsd.toFixed(2)} USDT)`,
    });

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
                <th className="px-6 py-4">Saldo em Conta</th>
                <th className="px-6 py-4">Adicionar Saldo</th>
                <th className="px-6 py-4">Pedidos</th>
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
                    <td className="px-6 py-4 text-xs font-semibold">
                      <div className="font-mono text-emerald-400 font-bold">
                        ${((cli.saldo_carteira_stars || 0) / 50).toFixed(2)} USDT
                      </div>
                      <div className="text-[10px] text-amber-400 font-mono">
                        {cli.saldo_carteira_stars || 0} ⭐
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <form action={addCredit} className="inline-flex items-center gap-1.5">
                        <input type="hidden" name="clienteId" value={cli.id} />
                        <div className="relative">
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-mono">$</span>
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            name="valorUsd"
                            placeholder="0.00"
                            required
                            className="w-16 pl-4 pr-1 py-1 bg-slate-900 border border-white/[0.12] rounded text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <button
                          type="submit"
                          className="px-2 py-1 rounded text-[11px] font-semibold bg-emerald-600/30 hover:bg-emerald-600 text-emerald-200 hover:text-white border border-emerald-500/40 transition-colors"
                          title="Creditar saldo para o cliente"
                        >
                          + Adicionar
                        </button>
                      </form>
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
