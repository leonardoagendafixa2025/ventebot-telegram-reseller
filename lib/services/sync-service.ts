import { VenteBotClient } from "@/lib/ventebot/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { VenteBotProduct } from "@/lib/ventebot/types";

export class SyncService {
  private ventebot: VenteBotClient;

  constructor(ventebot?: VenteBotClient) {
    this.ventebot = ventebot || new VenteBotClient();
  }

  /**
   * Sincroniza o catálogo oficial da VenteBot com o banco de dados Supabase
   */
  async syncCatalog(): Promise<{
    success: boolean;
    total: number;
    created: number;
    updated: number;
    errors: string[];
  }> {
    if (!this.ventebot.hasKey()) {
      return {
        success: false,
        total: 0,
        created: 0,
        updated: 0,
        errors: ["Chave VENTEBOT_RESELLER_KEY não configurada."],
      };
    }

    const supabase = createAdminClient();
    const errors: string[] = [];
    let created = 0;
    let updated = 0;

    let remoteProducts: VenteBotProduct[] = [];
    try {
      remoteProducts = await this.ventebot.getProducts();
    } catch (err) {
      return {
        success: false,
        total: 0,
        created: 0,
        updated: 0,
        errors: [(err as Error).message],
      };
    }

    // Obter categoria padrão para produtos VenteBot
    const { data: defaultCat } = await supabase
      .from("categorias")
      .select("id")
      .eq("slug", "ventebot")
      .maybeSingle();

    let defaultCatId = defaultCat?.id;
    if (!defaultCatId) {
      const { data: newCat } = await supabase
        .from("categorias")
        .insert({
          nome: "VenteBot Oficial",
          slug: "ventebot",
          emoji: "⚡",
          ordem: 1,
          ativo: true,
        })
        .select("id")
        .single();
      defaultCatId = newCat?.id;
    }

    for (const prod of remoteProducts) {
      try {
        const costUsd = Number(prod.price_usd) || 0;
        
        // Verifica se o produto já existe no banco
        const { data: existing } = await supabase
          .from("produtos")
          .select("id, preco_venda_usd, preco_venda_stars")
          .eq("fornecedor_produto_id", prod.id)
          .maybeSingle();

        if (existing) {
          // Atualiza dados e custo sem resetar preço de venda customizado caso tenha sido editado
          const precoVendaUsd = existing.preco_venda_usd < costUsd ? costUsd * 1.3 : existing.preco_venda_usd;
          const precoStars = existing.preco_venda_stars || Math.max(1, Math.round(precoVendaUsd * 50));

          await supabase
            .from("produtos")
            .update({
              nome: prod.name,
              descricao: prod.description,
              emoji: prod.emoji || "📦",
              imagem_url: prod.image_url,
              custo_usd: costUsd,
              preco_venda_usd: precoVendaUsd,
              preco_venda_stars: precoStars,
              tipo_entrega: prod.delivery_type,
              garantia_dias: prod.warranty_days || 30,
              estoque_consultavel: prod.stock !== null,
              estoque_qtd: prod.stock,
              ultima_sincronizacao: new Date().toISOString(),
              dados_fornecedor: prod,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);

          updated++;
        } else {
          // Novo produto cadastrado com margem padrão de 30% e conversão estimada para Telegram Stars (1 USD = 50 Stars)
          const precoVendaUsd = Number((costUsd * 1.3).toFixed(2));
          const precoStars = Math.max(1, Math.round(precoVendaUsd * 50));

          await supabase.from("produtos").insert({
            origem: "ventebot",
            fornecedor_produto_id: prod.id,
            nome: prod.name,
            descricao: prod.description,
            categoria_id: defaultCatId,
            emoji: prod.emoji || "📦",
            imagem_url: prod.image_url,
            custo_usd: costUsd,
            preco_venda_usd: precoVendaUsd,
            preco_venda_stars: precoStars,
            tipo_entrega: prod.delivery_type,
            garantia_dias: prod.warranty_days || 30,
            estoque_consultavel: prod.stock !== null,
            estoque_qtd: prod.stock,
            ativo: true,
            destaque: false,
            ultima_sincronizacao: new Date().toISOString(),
            dados_fornecedor: prod,
          });

          created++;
        }
      } catch (e) {
        errors.push(`Erro no produto #${prod.id} (${prod.name}): ${(e as Error).message}`);
      }
    }

    return {
      success: errors.length === 0,
      total: remoteProducts.length,
      created,
      updated,
      errors,
    };
  }
}
