import { VenteBotClient } from "@/lib/ventebot/client";
import { TelegramBotClient } from "@/lib/telegram/client";
import { createAdminClient } from "@/lib/supabase/admin";

export class OrderService {
  private ventebot: VenteBotClient;
  private telegram: TelegramBotClient;

  constructor(ventebot?: VenteBotClient, telegram?: TelegramBotClient) {
    this.ventebot = ventebot || new VenteBotClient();
    this.telegram = telegram || new TelegramBotClient();
  }

  /**
   * Cria um pedido interno com preço congelado via RPC atômica
   */
  async createOrder(params: {
    telegramId: number;
    username?: string;
    firstName?: string;
    produtoId: string;
    quantidade: number;
    metodoPagamento?: string;
    activationIdentifier?: string;
  }) {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("criar_pedido_atomicamente", {
      p_telegram_id: params.telegramId,
      p_username: params.username || null,
      p_first_name: params.firstName || null,
      p_produto_id: params.produtoId,
      p_quantidade: params.quantidade,
      p_metodo_pagamento: params.metodoPagamento || "telegram_stars",
      p_activation_identifier: params.activationIdentifier || null,
    });

    if (error) {
      throw new Error(`Erro ao criar pedido no banco: ${error.message}`);
    }

    if (!data.success) {
      throw new Error(data.message || "Não foi possível criar o pedido.");
    }

    return data;
  }

  /**
   * Confirma pagamento e dispara processamento com o fornecedor
   */
  async handlePaymentConfirmation(params: {
    pedidoId: string;
    provedor: string;
    referenciaExterna: string;
    valorStars: number;
    payloadSeguro: Record<string, unknown>;
  }) {
    const supabase = createAdminClient();

    // 1. Confirmação atômica no banco de dados com lock pessimista
    const { data: confirmResult, error: confirmErr } = await supabase.rpc(
      "confirmar_pagamento_atomicamente",
      {
        p_pedido_id: params.pedidoId,
        p_provedor: params.provedor,
        p_referencia_externa: params.referenciaExterna,
        p_valor_stars: params.valorStars,
        p_payload_seguro: params.payloadSeguro,
      }
    );

    if (confirmErr) {
      throw new Error(`Erro ao confirmar pagamento: ${confirmErr.message}`);
    }

    if (!confirmResult.success) {
      throw new Error(confirmResult.message || "Falha ao registrar pagamento.");
    }

    // Se já estava pago e processado, evita recomprar do fornecedor
    if (confirmResult.status === "ja_processado" || confirmResult.status === "ja_pago") {
      return { success: true, message: "Pagamento já processado anteriormente." };
    }

    // 2. Busca informações completas do pedido para fulfillment
    const { data: pedido, error: pedErr } = await supabase
      .from("pedidos")
      .select(`
        *,
        cliente:clientes(id, telegram_id, username, first_name),
        produto:produtos(*)
      `)
      .eq("id", params.pedidoId)
      .single();

    if (pedErr || !pedido) {
      throw new Error("Pedido não encontrado após confirmação de pagamento.");
    }

    const clienteTgId = pedido.cliente?.telegram_id;

    // 3. Verifica se é produto próprio ou VenteBot
    if (pedido.produto?.origem === "proprio") {
      return await this.fulfillProprietaryProduct(pedido);
    }

    // 4. Fulfillment com VenteBot
    return await this.fulfillVenteBotProduct(pedido);
  }

  /**
   * Executa a compra e entrega junto à VenteBot
   */
  private async fulfillVenteBotProduct(pedido: any) {
    const supabase = createAdminClient();
    const clienteTgId = pedido.cliente?.telegram_id;
    const fornecedorProdId = pedido.produto?.fornecedor_produto_id;

    if (!fornecedorProdId) {
      await supabase.rpc("registrar_entrega_atomicamente", {
        p_pedido_id: pedido.id,
        p_status_fornecedor: "fornecedor_erro",
        p_status_entrega: "falha_entrega",
        p_fornecedor_order_id: null,
        p_fornecedor_order_number: null,
        p_conteudo_entregue: null,
        p_itens_entregues: null,
        p_detalhes_falha: "ID de produto do fornecedor não configurado.",
      });

      if (clienteTgId) {
        await this.telegram.sendMessage({
          chat_id: clienteTgId,
          text: `⚠️ <b>Pagamento confirmado!</b>\n\nNo entanto, ocorreu uma inconsistência técnica no produto. Nosso suporte já foi notificado para concluir sua entrega manualmente.\n\nNúmero do pedido: <code>${pedido.referencia_unica}</code>`,
          parse_mode: "HTML",
        });
      }
      return { success: false, message: "ID do fornecedor ausente." };
    }

    // Validar saldo da carteira do revendedor na VenteBot
    try {
      const balanceInfo = await this.ventebot.getBalance();
      const custoTotalEsperado = pedido.custo_unitario_usd * pedido.quantidade;
      if (balanceInfo.balance_usd < custoTotalEsperado) {
        // Alerta saldo insuficiente
        await supabase.rpc("registrar_entrega_atomicamente", {
          p_pedido_id: pedido.id,
          p_status_fornecedor: "fornecedor_erro",
          p_status_entrega: "pendente",
          p_fornecedor_order_id: null,
          p_fornecedor_order_number: null,
          p_conteudo_entregue: null,
          p_itens_entregues: null,
          p_detalhes_falha: `Saldo na VenteBot insuficiente ($${balanceInfo.balance_usd} < $${custoTotalEsperado}). Recarga necessária.`,
        });

        if (clienteTgId) {
          await this.telegram.sendMessage({
            chat_id: clienteTgId,
            text: `✅ <b>Pagamento recebido com sucesso!</b>\n\nSeu pedido <code>${pedido.referencia_unica}</code> está em fila de processamento e será entregue em instantes pela equipe de suporte.`,
            parse_mode: "HTML",
          });
        }

        return {
          success: false,
          message: "Saldo insuficiente no fornecedor. Pedido colocado em espera.",
        };
      }
    } catch (e) {
      console.warn("[OrderService] Não foi possível verificar saldo prévio:", e);
    }

    // Criar pedido no fornecedor com idempotência garantida
    try {
      const orderResp = await this.ventebot.createOrder(
        {
          product_id: fornecedorProdId,
          quantity: pedido.quantidade,
          customer_reference: `tg_${clienteTgId}_${pedido.referencia_unica}`,
          idempotency_key: pedido.idempotency_key,
          activation_identifier: pedido.activation_identifier || undefined,
        },
        pedido.id
      );

      const vOrder = orderResp.order;

      if (vOrder.status === "COMPLETED") {
        // Entrega imediata de estoque ou credenciais
        const items = vOrder.items || [];
        const conteudo = items.map((i) => i.account_data).join("\n\n");

        await supabase.rpc("registrar_entrega_atomicamente", {
          p_pedido_id: pedido.id,
          p_status_fornecedor: "COMPLETED",
          p_status_entrega: "entregue",
          p_fornecedor_order_id: vOrder.id,
          p_fornecedor_order_number: vOrder.order_number,
          p_conteudo_entregue: conteudo,
          p_itens_entregues: items,
          p_detalhes_falha: null,
        });

        // Enviar itens ao cliente
        if (clienteTgId) {
          await this.telegram.sendMessage({
            chat_id: clienteTgId,
            text: `🎉 <b>Pedido Entregue com Sucesso!</b>\n\n📦 <b>Produto:</b> ${pedido.produto?.nome}\n🔢 <b>Qtd:</b> ${pedido.quantidade}\n🏷️ <b>Ref:</b> <code>${pedido.referencia_unica}</code>\n\n<b>Dados de acesso / Entrega:</b>\n<pre>${conteudo}</pre>\n\n<i>Obrigado pela preferência! Caso precise de suporte, digite /support.</i>`,
            parse_mode: "HTML",
          });
        }

        // Publicar venda no canal público se configurado (anonimizando cliente)
        await this.publishSaleToChannel(pedido);

        return { success: true, status: "entregue", order: vOrder };
      } else if (
        vOrder.status === "AWAITING_ACTIVATION" ||
        vOrder.status === "PAID_PENDING_DELIVERY" ||
        vOrder.status === "AWAITING_ACTIVATION_INFO"
      ) {
        // Pedido aceito e aguardando ativação/processamento pelo fornecedor
        await supabase.rpc("registrar_entrega_atomicamente", {
          p_pedido_id: pedido.id,
          p_status_fornecedor: vOrder.status,
          p_status_entrega: "pendente",
          p_fornecedor_order_id: vOrder.id,
          p_fornecedor_order_number: vOrder.order_number,
          p_conteudo_entregue: null,
          p_itens_entregues: null,
          p_detalhes_falha: null,
        });

        if (clienteTgId) {
          await this.telegram.sendMessage({
            chat_id: clienteTgId,
            text: `✅ <b>Pagamento Aprovado!</b>\n\nSeu pedido <code>${pedido.referencia_unica}</code> está em ativação pelo fornecedor (Status: <b>${vOrder.status}</b>).\nAssim que a ativação for concluída, você receberá a notificação aqui!`,
            parse_mode: "HTML",
          });
        }

        return { success: true, status: vOrder.status, order: vOrder };
      } else {
        // Status inesperado ou cancelado
        await supabase.rpc("registrar_entrega_atomicamente", {
          p_pedido_id: pedido.id,
          p_status_fornecedor: vOrder.status,
          p_status_entrega: "falha_entrega",
          p_fornecedor_order_id: vOrder.id,
          p_fornecedor_order_number: vOrder.order_number,
          p_conteudo_entregue: null,
          p_itens_entregues: null,
          p_detalhes_falha: `Status retornado pelo fornecedor: ${vOrder.status}`,
        });

        return { success: false, status: vOrder.status };
      }
    } catch (err: any) {
      const isTimeout = (err.message || "").toLowerCase().includes("timeout");
      const statusFornecedor = isTimeout
        ? "fornecedor_status_desconhecido"
        : "fornecedor_erro";

      await supabase.rpc("registrar_entrega_atomicamente", {
        p_pedido_id: pedido.id,
        p_status_fornecedor: statusFornecedor,
        p_status_entrega: "pendente",
        p_fornecedor_order_id: null,
        p_fornecedor_order_number: null,
        p_conteudo_entregue: null,
        p_itens_entregues: null,
        p_detalhes_falha: err.message,
      });

      if (clienteTgId) {
        await this.telegram.sendMessage({
          chat_id: clienteTgId,
          text: `⏳ <b>Pagamento registrado!</b>\n\nO processamento com o fornecedor está em andamento. Nosso sistema está reconciliando sua entrega.\nRef: <code>${pedido.referencia_unica}</code>`,
          parse_mode: "HTML",
        });
      }

      return {
        success: false,
        status: statusFornecedor,
        message: err.message,
      };
    }
  }

  /**
   * Processa entrega de item próprio do estoque
   */
  private async fulfillProprietaryProduct(pedido: any) {
    const supabase = createAdminClient();
    const clienteTgId = pedido.cliente?.telegram_id;

    // Buscar item no estoque próprio com lock
    const { data: itens, error } = await supabase
      .from("estoque_itens")
      .select("*")
      .eq("produto_id", pedido.produto_id)
      .eq("status", "disponivel")
      .limit(pedido.quantidade);

    if (error || !itens || itens.length < pedido.quantidade) {
      await supabase.rpc("registrar_entrega_atomicamente", {
        p_pedido_id: pedido.id,
        p_status_fornecedor: "fornecedor_erro",
        p_status_entrega: "pendente",
        p_fornecedor_order_id: null,
        p_fornecedor_order_number: null,
        p_conteudo_entregue: null,
        p_itens_entregues: null,
        p_detalhes_falha: "Estoque próprio insuficiente no momento da entrega.",
      });

      if (clienteTgId) {
        await this.telegram.sendMessage({
          chat_id: clienteTgId,
          text: `⚠️ <b>Pagamento aprovado!</b>\n\nO item selecionado aguarda reposição imediata pela equipe. O suporte foi notificado.\nPedido: <code>${pedido.referencia_unica}</code>`,
          parse_mode: "HTML",
        });
      }
      return { success: false, message: "Estoque insuficiente" };
    }

    const itemIds = itens.map((i) => i.id);
    const conteudo = itens.map((i) => i.conteudo).join("\n\n");

    // Marcar itens como entregues
    await supabase
      .from("estoque_itens")
      .update({
        status: "entregue",
        pedido_id: pedido.id,
        entregue_em: new Date().toISOString(),
      })
      .in("id", itemIds);

    await supabase.rpc("registrar_entrega_atomicamente", {
      p_pedido_id: pedido.id,
      p_status_fornecedor: "COMPLETED",
      p_status_entrega: "entregue",
      p_fornecedor_order_id: null,
      p_fornecedor_order_number: null,
      p_conteudo_entregue: conteudo,
      p_itens_entregues: itens,
      p_detalhes_falha: null,
    });

    if (clienteTgId) {
      await this.telegram.sendMessage({
        chat_id: clienteTgId,
        text: `🎉 <b>Pedido Entregue!</b>\n\n📦 <b>Produto:</b> ${pedido.produto?.nome}\n🔢 <b>Qtd:</b> ${pedido.quantidade}\n🏷️ <b>Ref:</b> <code>${pedido.referencia_unica}</code>\n\n<b>Conteúdo:</b>\n<pre>${conteudo}</pre>`,
        parse_mode: "HTML",
      });
    }

    await this.publishSaleToChannel(pedido);
    return { success: true, status: "entregue" };
  }

  /**
   * Publica social proof segura no canal público se configurado
   */
  private async publishSaleToChannel(pedido: any) {
    const channelId = process.env.TELEGRAM_PUBLIC_CHANNEL_ID;
    if (!channelId || !this.telegram.hasToken()) return;

    try {
      const supabase = createAdminClient();
      const maskedUser = pedido.cliente?.username
        ? `@${pedido.cliente.username.slice(0, 3)}***`
        : `Cliente ***${String(pedido.cliente?.telegram_id || "").slice(-3)}`;

      const botUsername = process.env.TELEGRAM_BOT_USERNAME || "";
      const deepLink = botUsername
        ? `https://t.me/${botUsername}?start=prod_${pedido.produto?.id}`
        : "";

      const text = `🛍️ <b>Nova Venda Realizada!</b>\n\n📦 <b>Produto:</b> ${pedido.produto?.nome}\n👤 <b>Comprador:</b> ${maskedUser}\n⚡ <b>Entrega:</b> 100% Automática e Instantânea\n\nGaranta o seu agora mesmo:`;

      const replyMarkup = deepLink
        ? {
            inline_keyboard: [[{ text: "🛒 Comprar Produto", url: deepLink }]],
          }
        : undefined;

      const sent = await this.telegram.sendMessage({
        chat_id: channelId,
        text,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      });

      await supabase.from("publicacoes_canal").insert({
        tipo: "venda",
        produto_id: pedido.produto_id,
        pedido_id: pedido.id,
        mensagem_telegram_id: sent.message_id,
        conteudo_publicado: text,
        status: "publicado",
      });
    } catch (err) {
      console.warn("[OrderService] Erro ao publicar no canal:", err);
    }
  }

  /**
   * Reprocessa um pedido com `fornecedor_erro` ou `pendente` que ficou sem entrega.
   * Usado quando o operador repõe saldo no fornecedor e quer liberar manualmente.
   */
  async retryPedidoFornecedorErro(pedidoId: string): Promise<{
    success: boolean;
    message: string;
    status?: string;
  }> {
    const supabase = createAdminClient();

    // Busca o pedido com todos os dados relacionados
    const { data: pedido, error: pedErr } = await supabase
      .from("pedidos")
      .select(`
        *,
        cliente:clientes(id, telegram_id, username, first_name),
        produto:produtos(*)
      `)
      .eq("id", pedidoId)
      .single();

    if (pedErr || !pedido) {
      return { success: false, message: "Pedido não encontrado." };
    }

    // Apenas reprocessa pedidos que foram pagos e não entregues
    if (pedido.status_pagamento !== "pago") {
      return { success: false, message: "Pedido não está marcado como pago. Não pode ser reprocessado." };
    }

    if (pedido.status_entrega === "entregue") {
      return { success: false, message: "Pedido já foi entregue anteriormente." };
    }

    const statusPermitidos = ["fornecedor_erro", "fornecedor_status_desconhecido", null, ""];
    if (!statusPermitidos.includes(pedido.status_fornecedor)) {
      return {
        success: false,
        message: `Status do fornecedor '${pedido.status_fornecedor}' não permite reprocessamento manual. Use a reconciliação automática.`,
      };
    }

    // Delegar ao fulfillment correto
    if (pedido.produto?.origem === "proprio") {
      const result = await this.fulfillProprietaryProduct(pedido);
      return {
        success: result.success,
        message: result.success ? "Produto próprio entregue com sucesso!" : (result.message || "Falha ao entregar produto próprio."),
        status: result.success ? "entregue" : "pendente",
      };
    }

    const result = await this.fulfillVenteBotProduct(pedido);
    return {
      success: result.success,
      message: result.success
        ? "Pedido reprocessado e entregue com sucesso!"
        : (result.message || "Falha ao reprocessar com VenteBot."),
      status: (result as any).status,
    };
  }

  /**
   * Entrega manual de credenciais pelo operador/administrador.
   * Usado quando o produto foi descontinuado no fornecedor ou quando o operador
   * deseja fornecer credenciais próprias diretamente ao cliente pelo Telegram.
   */
  async manualDeliver(pedidoId: string, conteudo: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const supabase = createAdminClient();

    const { data: pedido, error } = await supabase
      .from("pedidos")
      .select(`
        *,
        cliente:clientes(id, telegram_id, username, first_name),
        produto:produtos(*)
      `)
      .eq("id", pedidoId)
      .single();

    if (error || !pedido) {
      return { success: false, message: "Pedido não encontrado." };
    }

    if (pedido.status_entrega === "entregue") {
      return { success: false, message: "Este pedido já foi marcado como entregue anteriormente." };
    }

    if (!conteudo || !conteudo.trim()) {
      return { success: false, message: "O conteúdo / credenciais da entrega não podem estar vazios." };
    }

    const conteudoTrimmed = conteudo.trim();

    // Tenta registrar atomicamente
    const { error: rpcErr } = await supabase.rpc("registrar_entrega_atomicamente", {
      p_pedido_id: pedido.id,
      p_status_fornecedor: "manual_entregue",
      p_status_entrega: "entregue",
      p_fornecedor_order_id: null,
      p_fornecedor_order_number: null,
      p_conteudo_entregue: conteudoTrimmed,
      p_itens_entregues: [{ account_data: conteudoTrimmed }],
      p_detalhes_falha: null,
    });

    if (rpcErr) {
      // Fallback update direto na tabela de pedidos
      await supabase
        .from("pedidos")
        .update({
          status_entrega: "entregue",
          status_fornecedor: "manual_entregue",
          status_pagamento: "pago",
          conteudo_entregue: conteudoTrimmed,
          detalhes_falha: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pedido.id);
    }

    // Notifica o cliente instantaneamente no chat do Telegram
    const clienteTgId = pedido.cliente?.telegram_id;
    if (clienteTgId) {
      try {
        await this.telegram.sendMessage({
          chat_id: clienteTgId,
          text:
            `🎉 <b>Pedido Entregue com Sucesso!</b>\n\n` +
            `📦 <b>Produto:</b> ${pedido.produto?.nome || "Produto Digital"}\n` +
            `🔢 <b>Qtd:</b> ${pedido.quantidade}\n` +
            `🏷️ <b>Ref:</b> <code>${pedido.referencia_unica}</code>\n\n` +
            `<b>Dados de acesso / Licença:</b>\n<pre>${conteudoTrimmed}</pre>\n\n` +
            `<i>Obrigado pela preferência! Caso precise de suporte, digite /suporte.</i>`,
          parse_mode: "HTML",
        });
      } catch (tgErr) {
        console.warn("[OrderService] Erro ao enviar mensagem de entrega manual no Telegram:", tgErr);
      }
    }

    // Publica no canal público se configurado
    try {
      await this.publishSaleToChannel(pedido);
    } catch {}

    return {
      success: true,
      message: "Pedido entregue com sucesso e dados enviados ao cliente no Telegram!",
    };
  }

  /**
   * Cancela um pedido manualmente
   */
  async cancelOrder(pedidoId: string, motivo?: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const supabase = createAdminClient();

    const { data: pedido, error } = await supabase
      .from("pedidos")
      .select(`
        *,
        cliente:clientes(id, telegram_id, username, first_name),
        produto:produtos(*)
      `)
      .eq("id", pedidoId)
      .single();

    if (error || !pedido) {
      return { success: false, message: "Pedido não encontrado." };
    }

    if (pedido.status_entrega === "entregue") {
      return { success: false, message: "Pedido já entregue não pode ser cancelado." };
    }

    const detalhe = motivo || "Cancelado pelo operador da loja.";

    await supabase
      .from("pedidos")
      .update({
        status_pagamento: "cancelado",
        status_entrega: "falha_entrega",
        status_fornecedor: "cancelado",
        detalhes_falha: detalhe,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pedido.id);

    // Notifica cliente se aplicável
    const clienteTgId = pedido.cliente?.telegram_id;
    if (clienteTgId) {
      try {
        await this.telegram.sendMessage({
          chat_id: clienteTgId,
          text:
            `⚠️ <b>Atualização do Pedido <code>${pedido.referencia_unica}</code></b>\n\n` +
            `Seu pedido foi cancelado pelo suporte.\n` +
            `<b>Motivo:</b> ${detalhe}\n\n` +
            `Se tiver dúvidas ou pagou via Binance, entre em contato em <b>🗣️ Suporte</b>.`,
          parse_mode: "HTML",
        });
      } catch (tgErr) {
        console.warn("[OrderService] Erro ao enviar cancelamento no Telegram:", tgErr);
      }
    }

    return { success: true, message: "Pedido cancelado com sucesso." };
  }

  /**
   * Reconcilia pedidos pendentes e consulta status no fornecedor
   */
  async reconcilePendingOrders(): Promise<{
    reconciled: number;
    errors: string[];
  }> {
    const supabase = createAdminClient();
    const errors: string[] = [];
    let reconciled = 0;

    const { data: pendentes, error } = await supabase
      .from("pedidos")
      .select(`
        *,
        cliente:clientes(id, telegram_id, username, first_name),
        produto:produtos(*)
      `)
      .eq("status_pagamento", "pago")
      .in("status_fornecedor", [
        "AWAITING_ACTIVATION",
        "PAID_PENDING_DELIVERY",
        "fornecedor_status_desconhecido",
      ])
      .limit(30);

    if (error || !pendentes) {
      return { reconciled: 0, errors: [error?.message || "Erro ao consultar pedidos"] };
    }

    for (const ped of pendentes) {
      try {
        if (!ped.fornecedor_order_id) continue;

        const remoteOrder = await this.ventebot.getOrder(ped.fornecedor_order_id, ped.id);
        if (remoteOrder.status === "COMPLETED") {
          const items = remoteOrder.items || [];
          const conteudo = items.map((i) => i.account_data).join("\n\n");

          await supabase.rpc("registrar_entrega_atomicamente", {
            p_pedido_id: ped.id,
            p_status_fornecedor: "COMPLETED",
            p_status_entrega: "entregue",
            p_fornecedor_order_id: remoteOrder.id,
            p_fornecedor_order_number: remoteOrder.order_number,
            p_conteudo_entregue: conteudo,
            p_itens_entregues: items,
            p_detalhes_falha: null,
          });

          if (ped.cliente?.telegram_id) {
            await this.telegram.sendMessage({
              chat_id: ped.cliente.telegram_id,
              text: `🎉 <b>Seu pedido foi ativado e concluído!</b>\n\n📦 <b>Produto:</b> ${ped.produto?.nome}\n🏷️ <b>Ref:</b> <code>${ped.referencia_unica}</code>\n\n<b>Dados de entrega:</b>\n<pre>${conteudo}</pre>`,
              parse_mode: "HTML",
            });
          }

          reconciled++;
        }
      } catch (e) {
        errors.push(`Erro na reconciliação do pedido #${ped.id}: ${(e as Error).message}`);
      }
    }

    return { reconciled, errors };
  }
}
