import { VenteBotClient } from "@/lib/ventebot/client";
import { TelegramBotClient } from "@/lib/telegram/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { VenteBotProduct } from "@/lib/ventebot/types";

export interface SyncCatalogOptions {
  broadcastAlerts?: boolean;
  forceFeaturedIfQuiet?: boolean;
  forceBroadcastNow?: boolean;
}

export class SyncService {
  private ventebot: VenteBotClient;
  private telegram: TelegramBotClient;

  constructor(ventebot?: VenteBotClient, telegram?: TelegramBotClient) {
    this.ventebot = ventebot || new VenteBotClient();
    this.telegram = telegram || new TelegramBotClient();
  }

  /**
   * Dispara um produto no grupo público de promoções com deep link para o Bot
   */
  async broadcastProductAlert(params: {
    tipo: "novo_produto" | "restock" | "oferta";
    produto: {
      id: string;
      nome: string;
      descricao?: string | null;
      emoji?: string | null;
      preco_venda_usd: number;
      garantia_dias: number;
      estoque_qtd?: number | null;
    };
  }): Promise<boolean> {
    const rawChId = (process.env.TELEGRAM_PUBLIC_CHANNEL_ID || "").trim();
    const chId =
      rawChId && rawChId !== "undefined" && rawChId !== "null"
        ? rawChId
        : "-1004394737360";

    const rawBotUser = (process.env.TELEGRAM_BOT_USERNAME || "").trim();
    const botUser =
      rawBotUser && rawBotUser !== "undefined" && rawBotUser !== "null"
        ? rawBotUser.replace(/^@/, "")
        : "ventedigital_oficial_bot";

    const deepLink = `https://t.me/${botUser}?start=prod_${params.produto.id}`;
    const precoUsdt = Number(params.produto.preco_venda_usd).toFixed(2);
    const emoji = params.produto.emoji || "📦";

    let titulo = "🔥 <b>PRODUTO EM ESTOQUE / PRONTA ENTREGA!</b>";
    let subtexto = "Item oficial disponível com liberação imediata e entrega 100% automática no nosso Bot!";
    let botaoTexto = "🛒 Comprar no Bot Agora";

    if (params.tipo === "novo_produto") {
      titulo = "🚀 <b>NOVO PRODUTO NO CATÁLOGO!</b>";
      subtexto = "Acabamos de cadastrar este produto com estoque oficial e entrega 100% automática!";
      botaoTexto = "✨ Comprar no Bot Agora";
    } else if (params.tipo === "restock") {
      titulo = "⚡ <b>REPOSIÇÃO DE ESTOQUE!</b>";
      subtexto = "Novas contas e licenças foram reabastecidas com liberação imediata no chat!";
      botaoTexto = "⚡ Garantir no Bot Agora";
    }

    const desc = params.produto.descricao
      ? params.produto.descricao.trim()
      : subtexto;

    const estoqueTexto =
      params.produto.estoque_qtd !== undefined && params.produto.estoque_qtd !== null
        ? `📦 <b>Estoque:</b> ${params.produto.estoque_qtd} unidades disponíveis\n`
        : "";

    const text =
      `${titulo}\n\n` +
      `${emoji} <b>${params.produto.nome}</b>\n\n` +
      `${desc}\n\n` +
      `💰 <b>Preço:</b> <b>$${precoUsdt} USDT</b>\n` +
      estoqueTexto +
      `🛡️ <b>Garantia:</b> ${params.produto.garantia_dias || 30} dias\n` +
      `⚡ <b>Entrega:</b> 100% Automática no chat\n\n` +
      `👇 <i>Toque no botão abaixo para garantir o seu no Bot:</i>`;

    try {
      const sent = await this.telegram.sendMessage({
        chat_id: chId,
        text,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: botaoTexto, url: deepLink }]],
        },
      });

      const supabase = createAdminClient();
      await supabase.from("publicacoes_canal").insert({
        tipo: params.tipo,
        produto_id: params.produto.id,
        mensagem_telegram_id: sent.message_id,
        conteudo_publicado: text,
        status: "publicado",
      });

      return true;
    } catch (err) {
      console.error("[Broadcast Alert] Falha ao enviar ao Telegram:", err);
      return false;
    }
  }

  /**
   * Sincroniza o catálogo oficial da VenteBot com o banco de dados Supabase
   * e dispara alertas de novos produtos e reposições automaticamente no grupo.
   */
  async syncCatalog(options?: SyncCatalogOptions): Promise<{
    success: boolean;
    total: number;
    created: number;
    updated: number;
    broadcastsSent: number;
    errors: string[];
  }> {
    if (!this.ventebot.hasKey()) {
      return {
        success: false,
        total: 0,
        created: 0,
        updated: 0,
        broadcastsSent: 0,
        errors: ["Chave VENTEBOT_RESELLER_KEY não configurada."],
      };
    }

    const supabase = createAdminClient();
    const errors: string[] = [];
    let created = 0;
    let updated = 0;
    let broadcastsSent = 0;

    let remoteProducts: VenteBotProduct[] = [];
    try {
      const prods = await this.ventebot.getProducts();
      remoteProducts = Array.isArray(prods) ? prods : [];
    } catch (err) {
      return {
        success: false,
        total: 0,
        created: 0,
        updated: 0,
        broadcastsSent: 0,
        errors: [(err as Error).message],
      };
    }

    // Obter categorias ativas mapeadas
    const { data: categorias } = await supabase
      .from("categorias")
      .select("id, slug")
      .eq("ativo", true);

    const defaultCatId = categorias && categorias.length > 0 ? categorias[0].id : null;

    // Otimização: Busca todos os produtos existentes em uma única consulta
    const { data: existingProducts } = await supabase
      .from("produtos")
      .select("id, fornecedor_produto_id, nome, emoji, descricao, preco_venda_usd, preco_venda_stars, garantia_dias, estoque_qtd, ativo, destaque");

    const existingMap = new Map<number, any>();
    if (existingProducts) {
      for (const item of existingProducts) {
        if (item.fornecedor_produto_id !== null && item.fornecedor_produto_id !== undefined) {
          existingMap.set(Number(item.fornecedor_produto_id), item);
        }
      }
    }

    const newProductsList: any[] = [];
    const restockedList: any[] = [];

    for (const prod of remoteProducts) {
      try {
        const costUsd = Number(prod.price_usd) || 0;
        const existing = existingMap.get(Number(prod.id));

        if (existing) {
          const precoVendaUsd =
            existing.preco_venda_usd < costUsd
              ? Number((costUsd * 1.3).toFixed(2))
              : existing.preco_venda_usd;
          const precoStars =
            existing.preco_venda_stars || Math.max(1, Math.round(precoVendaUsd * 50));

          // Detecta reposição de estoque (Restock): produto tinha 0 de estoque e agora tem > 0
          const previousStock = existing.estoque_qtd !== null ? existing.estoque_qtd : 0;
          const currentStock = prod.stock !== null ? prod.stock : 0;

          if (previousStock === 0 && currentStock > 0) {
            restockedList.push({
              id: existing.id,
              nome: prod.name,
              descricao: prod.description,
              emoji: prod.emoji || existing.emoji || "📦",
              preco_venda_usd: precoVendaUsd,
              garantia_dias: prod.warranty_days || existing.garantia_dias || 30,
              estoque_qtd: currentStock,
            });
          }

          await supabase
            .from("produtos")
            .update({
              nome: prod.name,
              descricao: prod.description,
              emoji: prod.emoji || existing.emoji || "📦",
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
          // Novo produto cadastrado
          const precoVendaUsd = Number((costUsd * 1.3).toFixed(2));
          const precoStars = Math.max(1, Math.round(precoVendaUsd * 50));

          const { data: insertedProd } = await supabase
            .from("produtos")
            .insert({
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
            })
            .select("id, nome, emoji, descricao, preco_venda_usd, garantia_dias, estoque_qtd")
            .single();

          if (insertedProd) {
            newProductsList.push(insertedProd);
          }

          created++;
        }
      } catch (e) {
        errors.push(`Erro no produto #${prod.id} (${prod.name}): ${(e as Error).message}`);
      }
    }

    // Desativar automaticamente produtos locais que o fornecedor removeu da API
    if (remoteProducts.length > 0) {
      try {
        const remoteIds = remoteProducts.map((p) => p.id);
        const { data: prodsLocais } = await supabase
          .from("produtos")
          .select("id, fornecedor_produto_id")
          .eq("origem", "ventebot")
          .eq("ativo", true);

        if (prodsLocais && prodsLocais.length > 0) {
          const remoteIdSet = new Set(remoteIds);
          const desativarIds = prodsLocais
            .filter((p) => p.fornecedor_produto_id && !remoteIdSet.has(p.fornecedor_produto_id))
            .map((p) => p.id);

          if (desativarIds.length > 0) {
            await supabase
              .from("produtos")
              .update({
                ativo: false,
                estoque_qtd: 0,
                ultima_sincronizacao: new Date().toISOString(),
              })
              .in("id", desativarIds);
          }
        }
      } catch (e) {
        console.warn("[SyncService] Erro ao desativar produtos removidos do fornecedor:", e);
      }
    }

    // -------------------------------------------------------------------------
    // DISPARO AUTOMÁTICO DE NOTIFICAÇÕES NO GRUPO DE PROMOÇÕES
    // -------------------------------------------------------------------------
    const shouldBroadcast = options?.broadcastAlerts !== false;

    if (shouldBroadcast) {
      try {
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

        // Busca publicações recentes nas últimas 12 horas para evitar repetição do mesmo item
        const { data: recentPosts } = await supabase
          .from("publicacoes_canal")
          .select("produto_id, created_at")
          .gte("created_at", twelveHoursAgo)
          .order("created_at", { ascending: false });

        const recentProdIds = new Set(
          (recentPosts || []).map((p) => p.produto_id).filter(Boolean)
        );

        // 1. Dispara novos produtos (limite máximo de 2 por execução para evitar flood)
        const unannouncedNew = newProductsList.filter(
          (p) => !recentProdIds.has(p.id)
        );
        for (const item of unannouncedNew.slice(0, 2)) {
          const sent = await this.broadcastProductAlert({
            tipo: "novo_produto",
            produto: item,
          });
          if (sent) broadcastsSent++;
        }

        // 2. Dispara reposições de estoque (limite máximo de 2 por execução)
        const unannouncedRestock = restockedList.filter(
          (p) => !recentProdIds.has(p.id)
        );
        for (const item of unannouncedRestock.slice(0, 2)) {
          const sent = await this.broadcastProductAlert({
            tipo: "restock",
            produto: item,
          });
          if (sent) broadcastsSent++;
        }

        // 3. SE NÃO HOUVE NOVO PRODUTO NEM REPOSIÇÃO:
        // Piloto Automático de Produtos em Estoque!
        // Envia uma notificação de produto ativo em estoque para manter o grupo dinâmico e aquecido
        const lastPostAt =
          recentPosts && recentPosts.length > 0
            ? new Date(recentPosts[0].created_at).getTime()
            : 0;
        const minutesSinceLastPost = (Date.now() - lastPostAt) / (60 * 1000);

        // Dispara se o grupo estiver sem post há pelo menos 45 minutos (ou se solicitado forçar imediatamente)
        const isQuietGroup = minutesSinceLastPost >= 45;
        const shouldPostInStock =
          broadcastsSent === 0 &&
          (options?.forceBroadcastNow || (options?.forceFeaturedIfQuiet && isQuietGroup));

        if (shouldPostInStock) {
          // Busca produtos ativos com estoque positivo
          const { data: inStockProducts } = await supabase
            .from("produtos")
            .select("id, nome, emoji, descricao, preco_venda_usd, garantia_dias, estoque_qtd, destaque")
            .eq("ativo", true)
            .gt("estoque_qtd", 0)
            .order("destaque", { ascending: false });

          if (inStockProducts && inStockProducts.length > 0) {
            // Prioriza produtos com estoque que NÃO foram postados recentemente nas últimas 12 horas
            const freshCandidates = inStockProducts.filter(
              (p) => !recentProdIds.has(p.id)
            );

            let chosenProduct = null;
            if (freshCandidates.length > 0) {
              chosenProduct = freshCandidates[0];
            } else {
              // Se todos os 50+ itens já foram postados nas últimas 12h, escolhe aleatório entre os em estoque
              chosenProduct = inStockProducts[Math.floor(Math.random() * inStockProducts.length)];
            }

            if (chosenProduct) {
              const sent = await this.broadcastProductAlert({
                tipo: "oferta",
                produto: chosenProduct,
              });
              if (sent) broadcastsSent++;
            }
          }
        }
      } catch (err) {
        console.error("[SyncService] Erro ao disparar alertas no canal:", err);
      }
    }

    return {
      success: errors.length === 0,
      total: remoteProducts.length,
      created,
      updated,
      broadcastsSent,
      errors,
    };
  }
}
