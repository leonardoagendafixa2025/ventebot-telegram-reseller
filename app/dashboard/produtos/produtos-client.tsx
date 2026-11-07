"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Package,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Star,
  DollarSign,
  TrendingUp,
  Layers,
  Sparkles,
  Save,
  Check,
  Loader2,
  Boxes,
} from "lucide-react";
import { toast } from "sonner";

export type ProdutoItem = {
  id: string;
  nome: string;
  descricao: string | null;
  categoria_id: string | null;
  emoji: string | null;
  origem: string;
  custo_usd: number;
  preco_venda_usd: number;
  preco_venda_stars: number;
  margem_lucro_usd: number | null;
  tipo_entrega: string;
  garantia_dias: number;
  estoque_qtd: number | null;
  ativo: boolean;
  destaque: boolean;
  fornecedor_produto_id: number | null;
  categoria?: { nome: string } | null;
};

interface ProdutosClientProps {
  initialProdutos: ProdutoItem[];
}

export function ProdutosClient({ initialProdutos }: ProdutosClientProps) {
  const [produtos, setProdutos] = useState<ProdutoItem[]>(initialProdutos);
  const [search, setSearch] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativo" | "pausado" | "destaque">("todos");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todas");

  // Estados locais para inputs de preço por produto
  const [priceInputs, setPriceInputs] = useState<
    Record<string, { usd: string; stars: string }>
  >(() => {
    const map: Record<string, { usd: string; stars: string }> = {};
    for (const p of initialProdutos) {
      map[p.id] = {
        usd: Number(p.preco_venda_usd || 0).toFixed(2),
        stars: String(p.preco_venda_stars || 1),
      };
    }
    return map;
  });

  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedSuccessId, setSavedSuccessId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Lista de categorias distintas
  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const p of produtos) {
      if (p.categoria?.nome) set.add(p.categoria.nome);
    }
    return Array.from(set).sort();
  }, [produtos]);

  // Contagens
  const stats = useMemo(() => {
    const total = produtos.length;
    const ativos = produtos.filter((p) => p.ativo).length;
    const pausados = total - ativos;
    const destaques = produtos.filter((p) => p.destaque).length;
    return { total, ativos, pausados, destaques };
  }, [produtos]);

  // Filtro
  const produtosFiltrados = useMemo(() => {
    return produtos.filter((p) => {
      // Filtro status
      if (filtroStatus === "ativo" && !p.ativo) return false;
      if (filtroStatus === "pausado" && p.ativo) return false;
      if (filtroStatus === "destaque" && !p.destaque) return false;

      // Filtro categoria
      if (filtroCategoria !== "todas" && p.categoria?.nome !== filtroCategoria) {
        return false;
      }

      // Filtro busca
      if (search.trim()) {
        const query = search.toLowerCase().trim();
        const nomeMatch = (p.nome || "").toLowerCase().includes(query);
        const catMatch = (p.categoria?.nome || "").toLowerCase().includes(query);
        const idFornecedorMatch = p.fornecedor_produto_id?.toString() === query;
        if (!nomeMatch && !catMatch && !idFornecedorMatch) return false;
      }

      return true;
    });
  }, [produtos, filtroStatus, filtroCategoria, search]);

  // Manipular mudança de preço USD com auto-cálculo de Stars
  function handleUsdChange(id: string, val: string) {
    const num = parseFloat(val);
    const suggestedStars = !isNaN(num) && num > 0 ? Math.max(1, Math.round(num * 50)) : 1;
    setPriceInputs((prev) => ({
      ...prev,
      [id]: {
        usd: val,
        stars: String(suggestedStars),
      },
    }));
  }

  function handleStarsChange(id: string, val: string) {
    setPriceInputs((prev) => ({
      ...prev,
      [id]: {
        usd: prev[id]?.usd ?? "0.00",
        stars: val,
      },
    }));
  }

  // Salvar Preços
  async function handleSavePrice(prod: ProdutoItem) {
    const inputs = priceInputs[prod.id];
    if (!inputs) return;

    const usd = parseFloat(inputs.usd);
    const stars = parseInt(inputs.stars, 10);

    if (isNaN(usd) || usd < 0) {
      toast.error("Preço USD inválido.");
      return;
    }

    setSavingId(prod.id);
    try {
      const res = await fetch("/api/products/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: prod.id,
          preco_venda_usd: usd,
          preco_venda_stars: isNaN(stars) || stars < 1 ? 1 : stars,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Falha ao salvar preços");
      }

      setProdutos((prev) =>
        prev.map((p) =>
          p.id === prod.id
            ? { ...p, preco_venda_usd: usd, preco_venda_stars: stars }
            : p
        )
      );

      setSavedSuccessId(prod.id);
      setTimeout(() => setSavedSuccessId(null), 2000);
      toast.success(`Preço de "${prod.nome.slice(0, 20)}" atualizado!`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar.");
    } finally {
      setSavingId(null);
    }
  }

  // Alternar Ativo/Pausado
  async function handleToggleAtivo(prod: ProdutoItem) {
    setTogglingId(prod.id);
    const novoStatus = !prod.ativo;

    try {
      const res = await fetch("/api/products/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: prod.id,
          ativo: novoStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Falha ao alterar status");
      }

      setProdutos((prev) =>
        prev.map((p) => (p.id === prod.id ? { ...p, ativo: novoStatus } : p))
      );

      toast.success(
        novoStatus
          ? `✅ "${prod.nome.slice(0, 20)}" ativado no Bot!`
          : `⏸️ "${prod.nome.slice(0, 20)}" pausado no Bot.`
      );
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar status.");
    } finally {
      setTogglingId(null);
    }
  }

  // Alternar Destaque
  async function handleToggleDestaque(prod: ProdutoItem) {
    const novoDestaque = !prod.destaque;
    try {
      const res = await fetch("/api/products/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: prod.id,
          destaque: novoDestaque,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Falha ao atualizar destaque");
      }

      setProdutos((prev) =>
        prev.map((p) => (p.id === prod.id ? { ...p, destaque: novoDestaque } : p))
      );

      toast.success(
        novoDestaque
          ? `⭐ "${prod.nome.slice(0, 20)}" colocado em Destaque!`
          : `Removido dos destaques.`
      );
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Package className="h-6 w-6 text-indigo-400" />
            <span>Gerenciamento de Produtos</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Configure preços em USDT/Stars, margem de lucro e disponibilidade em tempo real no bot do Telegram.
          </p>
        </div>

        <Link
          href="/dashboard/integracoes/ventebot"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition-all shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Sincronizar com VenteBot</span>
        </Link>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="glass-panel p-3.5 rounded-2xl border border-white/[0.08]">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Total de Produtos</span>
            <Boxes className="h-4 w-4 text-slate-500" />
          </div>
          <p className="text-xl font-bold text-white font-mono">{stats.total}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">no catálogo Supabase</p>
        </div>

        <div className="glass-panel p-3.5 rounded-2xl border border-white/[0.08]">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Ativos no Bot</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-emerald-400 font-mono">{stats.ativos}</p>
          <p className="text-[11px] text-emerald-500/80 mt-0.5">disponíveis para compra</p>
        </div>

        <div className="glass-panel p-3.5 rounded-2xl border border-white/[0.08]">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Pausados</span>
            <XCircle className="h-4 w-4 text-slate-400" />
          </div>
          <p className="text-xl font-bold text-slate-300 font-mono">{stats.pausados}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">ocultos no Telegram</p>
        </div>

        <div className="glass-panel p-3.5 rounded-2xl border border-white/[0.08]">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Destaques</span>
            <Sparkles className="h-4 w-4 text-amber-400" />
          </div>
          <p className="text-xl font-bold text-amber-400 font-mono">{stats.destaques}</p>
          <p className="text-[11px] text-amber-500/80 mt-0.5">no menu 🔥 do bot</p>
        </div>
      </div>

      {/* Barra de Filtros e Pesquisa */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 glass-panel p-3.5 rounded-2xl border border-white/[0.08]">
        {/* Input de Busca */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome do produto, ID ou categoria..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900/80 border border-white/[0.1] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filtros de Status */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "todos", label: "Todos", count: stats.total },
              { id: "ativo", label: "Ativos", count: stats.ativos },
              { id: "pausado", label: "Pausados", count: stats.pausados },
              { id: "destaque", label: "Destaques", count: stats.destaques },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFiltroStatus(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                filtroStatus === tab.id
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                  : "bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08]"
              }`}
            >
              {tab.label} <span className="opacity-70 text-[10px]">({tab.count})</span>
            </button>
          ))}

          {/* Seletor de Categoria */}
          {categorias.length > 0 && (
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              aria-label="Filtrar por Categoria"
              className="px-3 py-1.5 bg-slate-900 border border-white/[0.1] rounded-xl text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="todas">Todas Categorias</option>
              {categorias.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 1. VISÃO DESKTOP / TABLET (Tabela Completa sem Cortes)                */}
      {/* ===================================================================== */}
      <div className="hidden md:block glass-panel rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-sm min-w-[960px]">
            <thead className="bg-slate-900/80 text-[11px] font-semibold text-slate-400 border-b border-white/[0.06] uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5 min-w-[280px]">Produto & Origem</th>
                <th className="px-4 py-3.5 w-24 text-center">Estoque</th>
                <th className="px-4 py-3.5 w-24 text-right">Custo</th>
                <th className="px-5 py-3.5 min-w-[270px]">Preço Venda (USD / Stars)</th>
                <th className="px-4 py-3.5 w-28 text-right">Margem</th>
                <th className="px-4 py-3.5 w-32 text-center">Status no Bot</th>
                <th className="px-4 py-3.5 w-20 text-center">Destaque</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {produtosFiltrados.length > 0 ? (
                produtosFiltrados.map((prod) => {
                  const inputs = priceInputs[prod.id] || {
                    usd: Number(prod.preco_venda_usd || 0).toFixed(2),
                    stars: String(prod.preco_venda_stars || 1),
                  };
                  const currentUsd = parseFloat(inputs.usd) || Number(prod.preco_venda_usd || 0);
                  const custo = Number(prod.custo_usd || 0);
                  const margem = currentUsd - custo;
                  const margemPerc = custo > 0 ? ((margem / custo) * 100).toFixed(0) : "100";
                  const isSaving = savingId === prod.id;
                  const isSaved = savedSuccessId === prod.id;
                  const isToggling = togglingId === prod.id;

                  return (
                    <tr
                      key={prod.id}
                      className="hover:bg-white/[0.02] transition-colors group"
                    >
                      {/* Produto & Origem */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-start gap-3">
                          <span className="text-2xl mt-0.5 shrink-0">
                            {prod.emoji || "📦"}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-white text-xs sm:text-sm line-clamp-1 group-hover:text-indigo-300 transition-colors">
                              {prod.nome}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {prod.origem === "ventebot" ? (
                                <span className="inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30">
                                  VenteBot #{prod.fornecedor_produto_id}
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                                  Próprio
                                </span>
                              )}
                              <span className="text-[11px] text-slate-400">
                                {prod.categoria?.nome || "Sem categoria"}
                              </span>
                              <span className="text-[10px] text-slate-500">•</span>
                              <span className="text-[10px] text-slate-400">
                                {prod.garantia_dias}d garantia
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Estoque */}
                      <td className="px-4 py-3.5 text-center">
                        {prod.estoque_qtd !== null ? (
                          prod.estoque_qtd > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {prod.estoque_qtd} un
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                              0 un
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-slate-500 font-mono">
                            Ilimitado
                          </span>
                        )}
                      </td>

                      {/* Custo */}
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-slate-300">
                        ${custo.toFixed(2)}
                      </td>

                      {/* Preço de Venda (USD / Stars) + Botão Salvar */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          {/* Input USD */}
                          <div className="relative flex items-center">
                            <span className="absolute left-2 text-xs text-slate-500 font-mono pointer-events-none">
                              $
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={inputs.usd}
                              onChange={(e) => handleUsdChange(prod.id, e.target.value)}
                              className="w-20 pl-5 pr-2 py-1.5 bg-slate-900 border border-white/[0.12] rounded-lg text-white text-xs font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                              title="Preço de venda em USDT"
                            />
                          </div>

                          {/* Input Stars */}
                          <div className="relative flex items-center">
                            <input
                              type="number"
                              step="1"
                              min="1"
                              value={inputs.stars}
                              onChange={(e) => handleStarsChange(prod.id, e.target.value)}
                              className="w-16 pl-2 pr-6 py-1.5 bg-slate-900 border border-white/[0.12] rounded-lg text-amber-300 text-xs font-mono focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all text-right"
                              title="Preço equivalente em Telegram Stars"
                            />
                            <span className="absolute right-1.5 text-xs text-amber-400 pointer-events-none">
                              ⭐
                            </span>
                          </div>

                          {/* Botão Salvar */}
                          <button
                            type="button"
                            onClick={() => handleSavePrice(prod)}
                            disabled={isSaving}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 shrink-0 ${
                              isSaved
                                ? "bg-emerald-600 text-white"
                                : "bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40"
                            }`}
                            title="Salvar alterações de preço"
                          >
                            {isSaving ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : isSaved ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Save className="h-3 w-3" />
                            )}
                            <span>{isSaved ? "Salvo" : "Salvar"}</span>
                          </button>
                        </div>
                      </td>

                      {/* Margem */}
                      <td className="px-4 py-3.5 text-right font-mono text-xs">
                        <span
                          className={`font-semibold ${
                            margem >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {margem >= 0 ? `+$${margem.toFixed(2)}` : `-$${Math.abs(margem).toFixed(2)}`}
                        </span>
                        <p
                          className={`text-[10px] ${
                            margem >= 0 ? "text-emerald-500/70" : "text-red-400/70"
                          }`}
                        >
                          ({margemPerc}%)
                        </p>
                      </td>

                      {/* Status no Bot (Pausar/Ativar) */}
                      <td className="px-4 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleAtivo(prod)}
                          disabled={isToggling}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                            prod.ativo
                              ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25"
                              : "bg-slate-800 text-slate-400 border border-white/[0.08] hover:bg-slate-700 hover:text-slate-200"
                          }`}
                        >
                          {isToggling ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : prod.ativo ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-slate-500" />
                          )}
                          <span>{prod.ativo ? "Ativo" : "Pausado"}</span>
                        </button>
                      </td>

                      {/* Destaque */}
                      <td className="px-4 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleDestaque(prod)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            prod.destaque
                              ? "text-amber-400 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30"
                              : "text-slate-600 hover:text-slate-400 hover:bg-white/[0.04]"
                          }`}
                          title={prod.destaque ? "Remover destaque" : "Marcar como destaque"}
                        >
                          <Star className={`h-4 w-4 ${prod.destaque ? "fill-amber-400" : ""}`} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-sm">
                    Nenhum produto encontrado com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. VISÃO MOBILE-FIRST EM CARDS (Perfeito para Telas Pequenas)        */}
      {/* ===================================================================== */}
      <div className="md:hidden space-y-3">
        {produtosFiltrados.length > 0 ? (
          produtosFiltrados.map((prod) => {
            const inputs = priceInputs[prod.id] || {
              usd: Number(prod.preco_venda_usd || 0).toFixed(2),
              stars: String(prod.preco_venda_stars || 1),
            };
            const currentUsd = parseFloat(inputs.usd) || Number(prod.preco_venda_usd || 0);
            const custo = Number(prod.custo_usd || 0);
            const margem = currentUsd - custo;
            const margemPerc = custo > 0 ? ((margem / custo) * 100).toFixed(0) : "100";
            const isSaving = savingId === prod.id;
            const isSaved = savedSuccessId === prod.id;
            const isToggling = togglingId === prod.id;

            return (
              <div
                key={prod.id}
                className="glass-panel p-4 rounded-2xl border border-white/[0.08] space-y-3"
              >
                {/* Topo: Emoji + Nome + Status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="text-2xl mt-0.5">{prod.emoji || "📦"}</span>
                    <div>
                      <p className="font-semibold text-white text-sm leading-tight">
                        {prod.nome}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {prod.origem === "ventebot" ? (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30">
                            VenteBot #{prod.fornecedor_produto_id}
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                            Próprio
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          {prod.categoria?.nome || "Geral"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleAtivo(prod)}
                    disabled={isToggling}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 flex items-center gap-1 ${
                      prod.ativo
                        ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                        : "bg-slate-800 text-slate-400 border border-white/[0.08]"
                    }`}
                  >
                    {prod.ativo ? "Ativo" : "Pausado"}
                  </button>
                </div>

                {/* Métricas: Estoque, Custo, Margem */}
                <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-black/40 border border-white/[0.05] text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Estoque</span>
                    <span className="font-mono font-semibold text-slate-200">
                      {prod.estoque_qtd !== null ? `${prod.estoque_qtd} un` : "Ilimitado"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Custo</span>
                    <span className="font-mono text-slate-300">${custo.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Margem</span>
                    <span
                      className={`font-mono font-semibold ${
                        margem >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      +${margem.toFixed(2)} ({margemPerc}%)
                    </span>
                  </div>
                </div>

                {/* Edição de Preços */}
                <div className="flex items-center gap-2 pt-1">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={inputs.usd}
                      onChange={(e) => handleUsdChange(prod.id, e.target.value)}
                      placeholder="USD"
                      className="w-full pl-6 pr-2 py-2 bg-slate-900 border border-white/[0.12] rounded-xl text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="relative flex-1">
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={inputs.stars}
                      onChange={(e) => handleStarsChange(prod.id, e.target.value)}
                      placeholder="Stars"
                      className="w-full pl-2.5 pr-6 py-2 bg-slate-900 border border-white/[0.12] rounded-xl text-amber-300 text-xs font-mono text-right focus:outline-none focus:border-amber-500"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-amber-400">
                      ⭐
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSavePrice(prod)}
                    disabled={isSaving}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      isSaved
                        ? "bg-emerald-600 text-white"
                        : "bg-indigo-600 hover:bg-indigo-500 text-white"
                    }`}
                  >
                    {isSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isSaved ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    <span>{isSaved ? "Salvo" : "Salvar"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleDestaque(prod)}
                    className={`p-2 rounded-xl border transition-colors ${
                      prod.destaque
                        ? "text-amber-400 bg-amber-500/15 border-amber-500/30"
                        : "text-slate-600 bg-white/[0.02] border-white/[0.08]"
                    }`}
                    title={prod.destaque ? "Remover destaque" : "Marcar destaque"}
                  >
                    <Star className={`h-4 w-4 ${prod.destaque ? "fill-amber-400" : ""}`} />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center glass-panel rounded-2xl text-slate-400 text-sm">
            Nenhum produto encontrado com os filtros atuais.
          </div>
        )}
      </div>
    </div>
  );
}
