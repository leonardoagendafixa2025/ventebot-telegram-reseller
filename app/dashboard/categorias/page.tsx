import { createClient } from "@/lib/supabase/server";
import { Layers, Plus, CheckCircle, XCircle } from "lucide-react";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export default async function CategoriasPage() {
  const supabase = await createClient();

  const { data: categorias } = await supabase
    .from("categorias")
    .select("*, produtos(count)")
    .order("ordem", { ascending: true });

  async function createCategoria(formData: FormData) {
    "use server";
    const nome = formData.get("nome") as string;
    const emoji = formData.get("emoji") as string;
    const ordem = Number(formData.get("ordem")) || 0;
    const slug = nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");

    const serverSupabase = await createClient();
    await serverSupabase.from("categorias").insert({
      nome,
      slug,
      emoji: emoji || "📁",
      ordem,
      ativo: true,
    });

    revalidatePath("/dashboard/categorias");
  }

  async function toggleCategoria(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const ativo = formData.get("ativo") === "true";

    const serverSupabase = await createClient();
    await serverSupabase
      .from("categorias")
      .update({ ativo: !ativo, updated_at: new Date().toISOString() })
      .eq("id", id);

    revalidatePath("/dashboard/categorias");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
          <Layers className="h-6 w-6 text-indigo-400" />
          <span>Categorias de Produtos</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Organize o catálogo apresentado aos clientes no Bot do Telegram.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulário: Nova Categoria */}
        <div className="glass-panel rounded-2xl p-6 border border-white/[0.08] h-fit">
          <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <Plus className="h-4 w-4 text-indigo-400" />
            <span>Nova Categoria</span>
          </h2>

          <form action={createCategoria} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Nome da Categoria
              </label>
              <input
                type="text"
                name="nome"
                required
                placeholder="Ex: IAs & Bots, VPNs, Streaming"
                className="w-full px-3.5 py-2 bg-slate-900 border border-white/[0.1] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Emoji
                </label>
                <input
                  type="text"
                  name="emoji"
                  defaultValue="⚡"
                  className="w-full px-3.5 py-2 bg-slate-900 border border-white/[0.1] rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Ordem de Exibição
                </label>
                <input
                  type="number"
                  name="ordem"
                  defaultValue="1"
                  className="w-full px-3.5 py-2 bg-slate-900 border border-white/[0.1] rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-md shadow-indigo-600/20 transition-all"
            >
              Adicionar Categoria
            </button>
          </form>
        </div>

        {/* Tabela de Categorias */}
        <div className="lg:col-span-2 glass-panel rounded-2xl border border-white/[0.08] overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/60 text-xs text-slate-400 border-b border-white/[0.06] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Ordem</th>
                <th className="px-6 py-3.5">Categoria</th>
                <th className="px-6 py-3.5">Slug</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {categorias && categorias.length > 0 ? (
                categorias.map((cat) => (
                  <tr key={cat.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 text-xs font-mono text-slate-400">
                      {cat.ordem}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-white flex items-center gap-2">
                      <span className="text-lg">{cat.emoji || "📁"}</span>
                      <span>{cat.nome}</span>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-400">
                      {cat.slug}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {cat.ativo ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle className="h-3 w-3" />
                          Visível
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-slate-800 text-slate-400">
                          <XCircle className="h-3 w-3" />
                          Oculta
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <form action={toggleCategoria}>
                        <input type="hidden" name="id" value={cat.id} />
                        <input type="hidden" name="ativo" value={String(cat.ativo)} />
                        <button
                          type="submit"
                          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
                        >
                          {cat.ativo ? "Ocultar" : "Mostrar"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500 text-xs">
                    Nenhuma categoria criada ainda.
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
