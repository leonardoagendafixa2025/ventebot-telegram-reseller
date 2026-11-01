import { createClient } from "@/lib/supabase/server";
import { Package, RefreshCw, CheckCircle, XCircle, Tag, DollarSign } from "lucide-react";
import Link from "next/link";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  const supabase = await createClient();

  const { data: produtos } = await supabase
    .from("produtos")
    .select("*, categoria:categorias(nome)")
    .order("ativo", { ascending: false })
    .order("nome", { ascending: true });

  async function toggleStatus(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const currentAtivo = formData.get("ativo") === "true";
    const serverSupabase = await createClient();

    await serverSupabase
      .from("produtos")
      .update({ ativo: !currentAtivo, updated_at: new Date().toISOString() })
      .eq("id", id);

    revalidatePath("/dashboard/produtos");
  }

  async function updatePrices(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const precoVendaUsd = Number(formData.get("preco_venda_usd"));
    const precoVendaStars = Math.max(1, Math.round(Number(formData.get("preco_venda_stars"))));

    const serverSupabase = await createClient();
    await serverSupabase
      .from("produtos")
      .update({
        preco_venda_usd: precoVendaUsd,
        preco_venda_stars: precoVendaStars,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    revalidatePath("/dashboard/produtos");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex flex-wrap items-center gap-2.5 sm:gap-3">
            <Package className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-400" />
            <span>Gerenciamento de Produtos</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Controle preços de venda, margem de lucro em Stars/USD e disponibilidade no bot do Telegram.
          </p>
        </div>

        <Link
          href="/dashboard/integracoes/ventebot"
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all w-full sm:w-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Sincronizar com VenteBot</span>
        </Link>
      </div>

      {/* Grid / Tabela de Produtos */}
      <div className="glass-panel rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[720px]">
            <thead className="bg-slate-900/60 text-xs text-slate-400 border-b border-white/[0.06] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Produto</th>
                <th className="px-6 py-4">Origem</th>
                <th className="px-6 py-4">Tipo Entrega</th>
                <th className="px-6 py-4">Custo (USD)</th>
                <th className="px-6 py-4">Preço Venda (USD / Stars)</th>
                <th className="px-6 py-4">Margem Estimada</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {produtos && produtos.length > 0 ? (
                produtos.map((prod) => {
                  const margem = Number(prod.preco_venda_usd) - Number(prod.custo_usd);
                  return (
                    <tr key={prod.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{prod.emoji || "📦"}</span>
                          <div>
                            <p className="font-semibold text-white text-sm">{prod.nome}</p>
                            <p className="text-xs text-slate-400">
                              {prod.categoria?.nome || "Sem Categoria"} • {prod.garantia_dias}d garantia
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-xs font-mono">
                        {prod.origem === "ventebot" ? (
                          <span className="text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">
                            VenteBot #{prod.fornecedor_produto_id}
                          </span>
                        ) : (
                          <span className="text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                            Próprio
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-xs text-slate-300">
                        {prod.tipo_entrega}
                      </td>

                      <td className="px-6 py-4 text-xs font-mono text-slate-300">
                        ${Number(prod.custo_usd).toFixed(2)}
                      </td>

                      <td className="px-6 py-4 text-xs">
                        <form action={updatePrices} className="flex items-center gap-2">
                          <input type="hidden" name="id" value={prod.id} />
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400">$</span>
                            <input
                              type="number"
                              name="preco_venda_usd"
                              step="0.01"
                              defaultValue={Number(prod.preco_venda_usd).toFixed(2)}
                              className="w-16 px-1.5 py-1 bg-slate-900 border border-white/[0.1] rounded text-white text-xs font-mono"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              name="preco_venda_stars"
                              step="1"
                              defaultValue={prod.preco_venda_stars}
                              className="w-16 px-1.5 py-1 bg-slate-900 border border-white/[0.1] rounded text-amber-300 text-xs font-mono"
                            />
                            <span className="text-amber-400">⭐</span>
                          </div>
                          <button
                            type="submit"
                            title="Salvar preços"
                            className="px-2 py-1 bg-white/[0.05] hover:bg-white/[0.1] rounded text-[11px] text-slate-200 transition-colors"
                          >
                            Salvar
                          </button>
                        </form>
                      </td>

                      <td className="px-6 py-4 text-xs font-mono">
                        <span
                          className={margem >= 0 ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}
                        >
                          ${margem.toFixed(2)}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-xs">
                        {prod.ativo ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle className="h-3 w-3" />
                            Ativo no Bot
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-slate-800 text-slate-400">
                            <XCircle className="h-3 w-3" />
                            Pausado
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <form action={toggleStatus}>
                          <input type="hidden" name="id" value={prod.id} />
                          <input type="hidden" name="ativo" value={String(prod.ativo)} />
                          <button
                            type="submit"
                            className={`text-xs px-3 py-1 rounded-lg transition-colors font-medium ${
                              prod.ativo
                                ? "text-amber-400 hover:bg-amber-500/10"
                                : "text-emerald-400 hover:bg-emerald-500/10"
                            }`}
                          >
                            {prod.ativo ? "Pausar" : "Ativar"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400 text-sm">
                    Nenhum produto cadastrado. Clique no botão acima para sincronizar produtos diretamente da VenteBot.
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
