import { NextRequest, NextResponse } from "next/server";
import { TelegramBotClient } from "@/lib/telegram/client";
import { TelegramInlineKeyboardMarkup, TelegramUpdate } from "@/lib/telegram/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrderService } from "@/lib/services/order-service";

// Teclado fixo persistente na base do chat do usuário com acesso direto ao Carrinho
const MAIN_REPLY_KEYBOARD = {
  keyboard: [
    [{ text: "🛍️ Ver Produtos" }, { text: "🛒 Meu Carrinho" }],
    [{ text: "🔥 Destaques" }, { text: "🔍 Buscar Produto" }],
    [{ text: "📦 Meus Pedidos" }, { text: "👤 Minha Conta" }],
    [{ text: "🗣️ Suporte" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

/**
 * Envia uma nova mensagem ou edita a existente caso messageId seja fornecido.
 */
async function sendOrEdit(
  telegram: TelegramBotClient,
  chatId: number,
  messageId: number | undefined,
  text: string,
  replyMarkup?: TelegramInlineKeyboardMarkup
) {
  if (messageId) {
    try {
      await telegram.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      });
      return;
    } catch {
      // Se não for possível editar (ex: mensagem antiga ou conteúdo idêntico), envia nova mensagem
    }
  }

  await telegram.sendMessage({
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const receivedSecret = req.headers.get("x-telegram-bot-api-secret-token");
    if (receivedSecret !== webhookSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const telegram = new TelegramBotClient();
  const orderService = new OrderService(undefined, telegram);
  const supabase = createAdminClient();

  // 1. Tratamento de Pre-Checkout Query (Stars legado / fallback)
  if (update.pre_checkout_query) {
    const pcq = update.pre_checkout_query;
    try {
      const payload = pcq.invoice_payload || "";
      if (!payload.startsWith("order_")) {
        await telegram.answerPreCheckoutQuery({
          pre_checkout_query_id: pcq.id,
          ok: false,
          error_message: "Fatura inválida ou corrompida.",
        });
        return NextResponse.json({ ok: true });
      }

      const pedidoId = payload.replace("order_", "");
      const { data: pedido } = await supabase
        .from("pedidos")
        .select("id, total_stars, status_pagamento")
        .eq("id", pedidoId)
        .maybeSingle();

      if (!pedido) {
        await telegram.answerPreCheckoutQuery({
          pre_checkout_query_id: pcq.id,
          ok: false,
          error_message: "Pedido não localizado.",
        });
        return NextResponse.json({ ok: true });
      }

      if (pedido.status_pagamento === "pago") {
        await telegram.answerPreCheckoutQuery({
          pre_checkout_query_id: pcq.id,
          ok: false,
          error_message: "Este pedido já foi pago e finalizado.",
        });
        return NextResponse.json({ ok: true });
      }

      if (pedido.total_stars !== pcq.total_amount) {
        await telegram.answerPreCheckoutQuery({
          pre_checkout_query_id: pcq.id,
          ok: false,
          error_message: "Valor divergente da cotação original.",
        });
        return NextResponse.json({ ok: true });
      }

      await telegram.answerPreCheckoutQuery({
        pre_checkout_query_id: pcq.id,
        ok: true,
      });
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error("[Webhook] Erro no pre_checkout_query:", err);
      await telegram.answerPreCheckoutQuery({
        pre_checkout_query_id: pcq.id,
        ok: false,
        error_message: "Falha de validação temporária. Tente novamente.",
      });
      return NextResponse.json({ ok: true });
    }
  }

  // 2. Tratamento de Pagamento Confirmado via Stars (Fallback)
  if (update.message?.successful_payment) {
    const sp = update.message.successful_payment;
    try {
      const payload = sp.invoice_payload || "";
      const pedidoId = payload.replace("order_", "");

      await orderService.handlePaymentConfirmation({
        pedidoId,
        provedor: "telegram_stars",
        referenciaExterna: sp.telegram_payment_charge_id,
        valorStars: sp.total_amount,
        payloadSeguro: {
          telegram_payment_charge_id: sp.telegram_payment_charge_id,
          provider_payment_charge_id: sp.provider_payment_charge_id,
          total_amount: sp.total_amount,
          currency: sp.currency,
          user_id: update.message.from?.id,
        },
      });

      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error("[Webhook] Erro ao processar successful_payment:", err);
      return NextResponse.json({ ok: true });
    }
  }

  // 3. Adição a Grupos/Canais (my_chat_member)
  if (update.my_chat_member) {
    const member = update.my_chat_member;
    const newStatus = member.new_chat_member?.status;
    const chat = member.chat;
    if (newStatus === "administrator" || newStatus === "member") {
      try {
        await telegram.sendMessage({
          chat_id: chat.id,
          text: `🤖 <b>Bot conectado com sucesso!</b>\n\n📢 <b>ID deste grupo/canal:</b> <code>${chat.id}</code>\n\n👉 Copie este ID e configure na variável <code>TELEGRAM_PUBLIC_CHANNEL_ID</code> na Vercel para ativar o canal de promoções!`,
          parse_mode: "HTML",
        });
      } catch (e) {
        console.error("[Webhook] Erro ao enviar mensagem de boas-vindas ao chat:", e);
      }
    }
    return NextResponse.json({ ok: true });
  }

  // 4. Tratamento de Mensagens de Texto e Comandos
  const incomingMsg = update.message || update.channel_post;
  if (incomingMsg?.text) {
    const msg = incomingMsg;
    const text = (msg.text || "").trim();
    const chatId = msg.chat.id;
    const user = msg.from;

    // Comando rápido para capturar ID de qualquer grupo ou canal
    if (text === "/id" || text === "/chatid" || text.startsWith("/id@") || text.startsWith("/chatid@")) {
      await telegram.sendMessage({
        chat_id: chatId,
        text: `ℹ️ <b>Informações deste Chat</b>\n\n• <b>ID:</b> <code>${chatId}</code>\n• <b>Tipo:</b> ${msg.chat.type}\n• <b>Título:</b> ${msg.chat.title || "Privado"}\n\n👉 Copie este ID e adicione na variável <b>TELEGRAM_PUBLIC_CHANNEL_ID</b> na Vercel!`,
        parse_mode: "HTML",
      });
      return NextResponse.json({ ok: true });
    }

    if (!user) return NextResponse.json({ ok: true });

    // Registra / atualiza cliente no banco
    await supabase.from("clientes").upsert(
      {
        telegram_id: user.id,
        username: user.username || null,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
      },
      { onConflict: "telegram_id" }
    );

    // Consulta estado atual da conversa
    const { data: clienteAtual } = await supabase
      .from("clientes")
      .select("id, estado_conversa")
      .eq("telegram_id", user.id)
      .maybeSingle();

    // 4.1 Cancelamento geral
    if (text.toLowerCase() === "/cancelar" || text.toLowerCase() === "cancelar" || text === "❌ Cancelar") {
      await supabase.from("clientes").update({ estado_conversa: null }).eq("telegram_id", user.id);
      await telegram.sendMessage({
        chat_id: chatId,
        text: "🔄 <b>Operação cancelada.</b>\n\nUse o menu abaixo para explorar nossa loja de produtos digitais:",
        parse_mode: "HTML",
        reply_markup: MAIN_REPLY_KEYBOARD,
      });
      await renderCategories(telegram, chatId);
      return NextResponse.json({ ok: true });
    }

    // 4.2 Cliente aguardando termo de busca
    if (clienteAtual?.estado_conversa === "aguardando_busca") {
      await supabase.from("clientes").update({ estado_conversa: null }).eq("telegram_id", user.id);
      await renderSearchResults(telegram, chatId, text);
      return NextResponse.json({ ok: true });
    }

    // 4.3 Cliente digitando quantidade customizada para um produto
    if (clienteAtual?.estado_conversa?.startsWith("aguardando_qtd:")) {
      const prodId = clienteAtual.estado_conversa.replace("aguardando_qtd:", "");
      await supabase.from("clientes").update({ estado_conversa: null }).eq("telegram_id", user.id);

      const parsedQty = parseInt(text.replace(/[^0-9]/g, ""), 10);
      if (isNaN(parsedQty) || parsedQty < 1 || parsedQty > 100) {
        await telegram.sendMessage({
          chat_id: chatId,
          text: "⚠️ <b>Quantidade inválida.</b>\n\nPor favor, envie um número inteiro entre <b>1</b> e <b>100</b>:",
          parse_mode: "HTML",
        });
        await supabase
          .from("clientes")
          .update({ estado_conversa: `aguardando_qtd:${prodId}` })
          .eq("telegram_id", user.id);
        return NextResponse.json({ ok: true });
      }

      await renderProductDetails(telegram, chatId, prodId, parsedQty);
      return NextResponse.json({ ok: true });
    }

    // 4.4 Cliente enviando TxID de pedido individual (com qualquer quantidade)
    if (clienteAtual?.estado_conversa?.startsWith("aguardando_txid:")) {
      const pedidoId = clienteAtual.estado_conversa.replace("aguardando_txid:", "");
      await supabase.from("clientes").update({ estado_conversa: null }).eq("telegram_id", user.id);

      const txId = text.replace(/[^a-zA-Z0-9_-]/g, "").trim();

      if (!txId || txId.length < 5) {
        await telegram.sendMessage({
          chat_id: chatId,
          text: `⚠️ <b>Código muito curto ou inválido.</b>\n\nPor favor, envie o ID da transação ou ordem gerado pelo app da Binance. Toque abaixo para tentar novamente:`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "⚡ Informar Novamente", callback_data: `informar_txid_${pedidoId}` }],
              [{ text: "❌ Cancelar Pedido", callback_data: `cancelar_pedido_${pedidoId}` }],
            ],
          },
        });
        return NextResponse.json({ ok: true });
      }

      // Verificação Anti-Fraude (Anti-Replay)
      const { data: pagamentoExistente } = await supabase
        .from("pagamentos")
        .select("id, pedido_id")
        .eq("referencia_externa", txId)
        .maybeSingle();

      if (pagamentoExistente) {
        await telegram.sendMessage({
          chat_id: chatId,
          text: `❌ <b>Este ID de transação já foi utilizado anteriormente.</b>\n\nCada compra requer uma transação única da Binance. Em caso de dúvidas, contate o suporte.`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🗣️ Falar com Suporte", callback_data: "support" }],
              [{ text: "🛍️ Voltar à Loja", callback_data: "browse_cat" }],
            ],
          },
        });
        return NextResponse.json({ ok: true });
      }

      await telegram.sendMessage({
        chat_id: chatId,
        text: `⏳ <b>Transação Binance recebida:</b> <code>${txId}</code>\n\nValidando pagamento e liberando sua entrega 100% automática...`,
        parse_mode: "HTML",
      });

      try {
        await supabase
          .from("pedidos")
          .update({
            binance_tx_id: txId,
            comprovante_texto: text,
          })
          .eq("id", pedidoId);

        await orderService.handlePaymentConfirmation({
          pedidoId,
          provedor: "binance_id",
          referenciaExterna: txId,
          valorStars: 0,
          payloadSeguro: {
            binance_uid_destinatario: "1257797463",
            binance_tx_id: txId,
            data: new Date().toISOString(),
          },
        });
      } catch (err: any) {
        console.error("[Binance Checkout] Erro no processamento automático:", err);
        await telegram.sendMessage({
          chat_id: chatId,
          text: `⚠️ <b>Recebemos seu ID (<code>${txId}</code>)!</b>\n\nO sistema está processando seu pedido. Se demorar mais de 1 minuto, consulte em <b>📦 Meus Pedidos</b> ou fale com nosso suporte.`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "📦 Ver Meus Pedidos", callback_data: "my_orders" }],
              [{ text: "🗣️ Falar com Suporte", callback_data: "support" }],
            ],
          },
        });
      }

      return NextResponse.json({ ok: true });
    }

    // 4.5 Cliente enviando TxID de lote do carrinho (múltiplos itens)
    if (clienteAtual?.estado_conversa?.startsWith("aguardando_txid_cart:")) {
      const pedidoIdsStr = clienteAtual.estado_conversa.replace("aguardando_txid_cart:", "");
      const pedidoIds = pedidoIdsStr.split(",").map((s: string) => s.trim()).filter(Boolean);

      await supabase.from("clientes").update({ estado_conversa: null }).eq("telegram_id", user.id);

      const txId = text.replace(/[^a-zA-Z0-9_-]/g, "").trim();
      if (!txId || txId.length < 5) {
        await telegram.sendMessage({
          chat_id: chatId,
          text: `⚠️ <b>Código muito curto ou inválido.</b>\n\nPor favor, envie o ID da transação ou ordem gerado pelo app da Binance:`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "⚡ Tentar Novamente", callback_data: "informar_txid_cart" }],
            ],
          },
        });
        return NextResponse.json({ ok: true });
      }

      // Anti-Replay
      const { data: pagamentoExistente } = await supabase
        .from("pagamentos")
        .select("id")
        .eq("referencia_externa", txId)
        .maybeSingle();

      if (pagamentoExistente) {
        await telegram.sendMessage({
          chat_id: chatId,
          text: `❌ <b>Este ID de transação já foi utilizado anteriormente.</b>\nCada compra requer uma transação única da Binance.`,
          parse_mode: "HTML",
        });
        return NextResponse.json({ ok: true });
      }

      await telegram.sendMessage({
        chat_id: chatId,
        text: `⏳ <b>Transação recebida:</b> <code>${txId}</code>\n\nValidando pagamento e processando a entrega de <b>${pedidoIds.length} produto(s)</b> do seu carrinho 100% automático...`,
        parse_mode: "HTML",
      });

      // Esvazia carrinho do cliente
      await supabase.from("clientes").update({ carrinho: [] }).eq("telegram_id", user.id);

      // Processa cada pedido do carrinho
      for (let i = 0; i < pedidoIds.length; i++) {
        const pId = pedidoIds[i];
        try {
          await supabase
            .from("pedidos")
            .update({
              binance_tx_id: txId,
              comprovante_texto: text,
            })
            .eq("id", pId);

          const refExterna = i === 0 ? txId : `${txId}_item_${i + 1}`;

          await orderService.handlePaymentConfirmation({
            pedidoId: pId,
            provedor: "binance_id",
            referenciaExterna: refExterna,
            valorStars: 0,
            payloadSeguro: {
              binance_uid_destinatario: "1257797463",
              binance_tx_id: txId,
              data: new Date().toISOString(),
              cart_index: i + 1,
            },
          });
        } catch (err) {
          console.error(`[Cart Checkout] Erro no pedido ${pId}:`, err);
        }
      }

      await telegram.sendMessage({
        chat_id: chatId,
        text:
          `🎉 <b>TODOS OS ITENS DO SEU CARRINHO FORAM PROCESSADOS!</b>\n\n` +
          `Suas licenças e dados de acesso foram enviados acima e já constam salvos permanentemente em <b>📦 Meus Pedidos</b>.\n\n` +
          `<i>Obrigado pela preferência na VenteDigital! 🚀</i>`,
        parse_mode: "HTML",
        reply_markup: MAIN_REPLY_KEYBOARD,
      });

      return NextResponse.json({ ok: true });
    }

    // 4.6 Deep link: /start prod_<id>
    if (text.startsWith("/start prod_")) {
      const prodId = text.replace("/start prod_", "").trim();
      await renderProductDetails(telegram, chatId, prodId, 1);
      return NextResponse.json({ ok: true });
    }

    // 4.7 Comando de Busca (/buscar <termo>)
    if (text.startsWith("/buscar")) {
      const termo = text.replace("/buscar", "").trim();
      if (!termo) {
        await supabase
          .from("clientes")
          .update({ estado_conversa: "aguardando_busca" })
          .eq("telegram_id", user.id);

        await telegram.sendMessage({
          chat_id: chatId,
          text: "🔍 <b>Pesquisa no Catálogo</b>\n\nDigite o nome do produto ou serviço que procura (ex: <i>Claude</i>, <i>Gemini</i>, <i>Notion</i>, <i>VPN</i>, <i>YouTube</i>):",
          parse_mode: "HTML",
        });
        return NextResponse.json({ ok: true });
      }
      await renderSearchResults(telegram, chatId, termo);
      return NextResponse.json({ ok: true });
    }

    // 4.8 Comando Início / Start
    if (text === "/start" || text === "🏠 Início" || text === "/home") {
      await telegram.sendMessage({
        chat_id: chatId,
        text:
          `👋 Olá, <b>${user.first_name || "Cliente"}</b>!\n\n` +
          `🛒 <b>Bem-vindo à Loja Oficial VenteDigital!</b>\n\n` +
          `Sua loja de produtos digitais no Telegram: Inteligência Artificial, Ferramentas Dev, Streaming e Licenças Premium com os melhores preços em <b>USDT</b> e <b>entrega 100% automática</b>! ⚡\n\n` +
          `✨ <b>Novidades:</b>\n` +
          `• Compre múltiplas quantidades de qualquer produto (1x, 2x, 5x, 10x ou digite)\n` +
          `• <b>Carrinho de Compras integrado:</b> junte vários itens e pague tudo em uma única transferência!\n` +
          `• Pagamento instantâneo via <b>Binance UID</b> (taxa 0%)\n` +
          `• Entrega imediata dos dados de acesso no chat\n\n` +
          `👇 <i>Escolha uma das categorias abaixo para começar:</i>`,
        parse_mode: "HTML",
        reply_markup: MAIN_REPLY_KEYBOARD,
      });

      await renderCategories(telegram, chatId);
      return NextResponse.json({ ok: true });
    }

    // 4.9 Catálogo de Produtos
    if (
      text === "/loja" ||
      text === "/products" ||
      text === "/produtos" ||
      text === "🛍️ Loja" ||
      text === "🛍️ Produtos" ||
      text === "🛍️ Ver Produtos"
    ) {
      await renderCategories(telegram, chatId);
      return NextResponse.json({ ok: true });
    }

    // 4.10 Carrinho de Compras
    if (
      text === "/carrinho" ||
      text === "/cart" ||
      text === "🛒 Meu Carrinho" ||
      text === "🛒 Carrinho"
    ) {
      await renderCart(telegram, chatId, user.id);
      return NextResponse.json({ ok: true });
    }

    // 4.11 Destaques
    if (text === "/destaques" || text === "🔥 Destaques") {
      await renderHighlights(telegram, chatId);
      return NextResponse.json({ ok: true });
    }

    // 4.12 Buscar
    if (text === "🔍 Buscar" || text === "🔍 Buscar Produto") {
      await supabase
        .from("clientes")
        .update({ estado_conversa: "aguardando_busca" })
        .eq("telegram_id", user.id);

      await telegram.sendMessage({
        chat_id: chatId,
        text: "🔍 <b>Pesquisa no Catálogo</b>\n\nDigite o nome do produto ou serviço que você procura (ex: <i>Claude</i>, <i>Gemini</i>, <i>ChatGPT</i>, <i>VPN</i>, <i>YouTube</i>):",
        parse_mode: "HTML",
      });
      return NextResponse.json({ ok: true });
    }

    // 4.13 Meus Pedidos
    if (text === "/orders" || text === "/pedidos" || text === "📦 Meus pedidos" || text === "📦 Meus Pedidos") {
      await renderUserOrders(telegram, chatId, user.id);
      return NextResponse.json({ ok: true });
    }

    // 4.14 Suporte
    if (text === "/support" || text === "/ajuda" || text === "/suporte" || text === "🗣️ Suporte") {
      await telegram.sendMessage({
        chat_id: chatId,
        text:
          `🗣️ <b>Central de Atendimento & Suporte</b>\n\n` +
          `Precisa de ajuda com algum pedido, licença ou dúvida técnica?\n\n` +
          `📢 <b>Canal de Novidades & Promoções:</b>\n` +
          `${process.env.TELEGRAM_PUBLIC_CHANNEL_ID || "@ventedigital_oficial_promo"}\n\n` +
          `⚡ <b>Garantia & Reposições:</b>\n` +
          `Todos os produtos contam com prazo de garantia integral. Se precisar de reposição ou tiver dúvidas, consulte seus dados em <b>📦 Meus Pedidos</b>.`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📦 Ver Meus Pedidos", callback_data: "my_orders" }],
            [{ text: "🛍️ Ir para a Loja", callback_data: "browse_cat" }],
          ],
        },
      });
      return NextResponse.json({ ok: true });
    }

    // 4.15 Minha Conta
    if (text === "👤 Minha conta" || text === "👤 Minha Conta") {
      await telegram.sendMessage({
        chat_id: chatId,
        text:
          `👤 <b>Minha Conta</b>\n\n` +
          `• <b>ID Telegram:</b> <code>${user.id}</code>\n` +
          `• <b>Usuário:</b> @${user.username || "não informado"}\n` +
          `• <b>Nome:</b> ${user.first_name} ${user.last_name || ""}\n` +
          `• <b>Método de Pagamento:</b> Binance UID (USDT)\n` +
          `• <b>Entrega:</b> 100% Automática no Chat\n\n` +
          `<i>Todas as suas licenças adquiridas ficam salvas permanentemente no seu histórico de pedidos!</i>`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🛒 Ver Meu Carrinho", callback_data: "view_cart" }],
            [{ text: "📦 Consultar Meus Pedidos", callback_data: "my_orders" }],
            [{ text: "🛍️ Explorar Catálogo", callback_data: "browse_cat" }],
          ],
        },
      });
      return NextResponse.json({ ok: true });
    }
  }

  // 5. Tratamento de Callbacks de Botões Inline
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = cb.data || "";
    const chatId = cb.message?.chat.id;
    const messageId = cb.message?.message_id;
    const user = cb.from;

    try {
      await telegram.answerCallbackQuery({ callback_query_id: cb.id });
    } catch {
      // Ignora expiração de callback query
    }

    if (!chatId) return NextResponse.json({ ok: true });

    // Botão noop (ex: indicador estático)
    if (data === "noop") {
      return NextResponse.json({ ok: true });
    }

    // Voltar à lista de categorias
    if (data === "browse_cat" || data === "home") {
      await renderCategories(telegram, chatId, messageId);
      return NextResponse.json({ ok: true });
    }

    // Ver produtos em destaque
    if (data === "highlights") {
      await renderHighlights(telegram, chatId, messageId);
      return NextResponse.json({ ok: true });
    }

    // Ver carrinho de compras
    if (data === "view_cart") {
      await renderCart(telegram, chatId, user.id, messageId);
      return NextResponse.json({ ok: true });
    }

    // Limpar carrinho
    if (data === "clear_cart") {
      await clearCart(telegram, chatId, user.id, messageId);
      return NextResponse.json({ ok: true });
    }

    // Finalizar compra do carrinho completo
    if (data === "checkout_cart") {
      await checkoutCart(telegram, orderService, chatId, user);
      return NextResponse.json({ ok: true });
    }

    // Cliente informando que já transferiu o valor do carrinho
    if (data === "informar_txid_cart") {
      await telegram.sendMessage({
        chat_id: chatId,
        text:
          `🧾 <b>Aguardando ID de Transação Binance (Carrinho)</b>\n\n` +
          `Envie aqui no chat o <b>ID da Transação / Ordem</b> gerado no app da Binance referente ao envio de USDT para o UID <code>1257797463</code>:\n\n` +
          `<i>⚡ Assim que você enviar, o sistema verificará e entregará todos os itens do carrinho automaticamente!</i>\n\n` +
          `<i>(Para cancelar, envie /cancelar)</i>`,
        parse_mode: "HTML",
      });
      return NextResponse.json({ ok: true });
    }

    // Cancelar carrinho
    if (data === "cancelar_cart") {
      const supabaseAdmin = createAdminClient();
      await supabaseAdmin
        .from("clientes")
        .update({ estado_conversa: null })
        .eq("telegram_id", user.id);

      await telegram.sendMessage({
        chat_id: chatId,
        text: "❌ Pagamento do carrinho cancelado. Seus itens permanecem salvos no carrinho.",
        reply_markup: MAIN_REPLY_KEYBOARD,
      });
      return NextResponse.json({ ok: true });
    }

    // Solicitar pesquisa
    if (data === "prompt_search") {
      const supabaseAdmin = createAdminClient();
      await supabaseAdmin
        .from("clientes")
        .update({ estado_conversa: "aguardando_busca" })
        .eq("telegram_id", user.id);

      await telegram.sendMessage({
        chat_id: chatId,
        text: "🔍 <b>Pesquisa no Catálogo</b>\n\nDigite o nome do produto ou serviço que procura (ex: <i>Claude</i>, <i>Gemini</i>, <i>Notion</i>, <i>VPN</i>, <i>YouTube</i>):",
        parse_mode: "HTML",
      });
      return NextResponse.json({ ok: true });
    }

    // Digitar quantidade personalizada (prompt_qty_<prodId>)
    if (data.startsWith("prompt_qty_")) {
      const prodId = data.replace("prompt_qty_", "");
      const supabaseAdmin = createAdminClient();
      await supabaseAdmin
        .from("clientes")
        .update({ estado_conversa: `aguardando_qtd:${prodId}` })
        .eq("telegram_id", user.id);

      await telegram.sendMessage({
        chat_id: chatId,
        text:
          `✏️ <b>Informe a quantidade desejada:</b>\n\n` +
          `Digite um número inteiro entre <b>1</b> e <b>100</b> (ex: 4, 12, 20...):\n\n` +
          `<i>(Se desejar cancelar, digite /cancelar)</i>`,
        parse_mode: "HTML",
      });
      return NextResponse.json({ ok: true });
    }

    // Adicionar item ao carrinho com quantidade (add_cart_<prodId>_<qty>)
    if (data.startsWith("add_cart_")) {
      const parts = data.replace("add_cart_", "").split("_");
      const prodId = parts[0];
      const qty = parts[1] ? parseInt(parts[1], 10) : 1;
      await addToCart(telegram, chatId, user, prodId, qty);
      return NextResponse.json({ ok: true });
    }

    // Navegar em categoria com paginação (cat_<catId>_<page>)
    if (data.startsWith("cat_")) {
      const parts = data.replace("cat_", "").split("_");
      const catId = parts[0];
      const page = parts[1] ? parseInt(parts[1], 10) : 1;
      await renderProductsInCategory(telegram, chatId, catId, page, messageId);
      return NextResponse.json({ ok: true });
    }

    // Ver detalhes do produto com seletor de quantidade (prod_<prodId> ou prod_<prodId>_<qty>)
    if (data.startsWith("prod_")) {
      const parts = data.replace("prod_", "").split("_");
      const prodId = parts[0];
      const qty = parts[1] ? parseInt(parts[1], 10) : 1;
      await renderProductDetails(telegram, chatId, prodId, qty, messageId);
      return NextResponse.json({ ok: true });
    }

    // Iniciar compra direta com quantidade (buy_<prodId> ou buy_<prodId>_<qty>)
    if (data.startsWith("buy_")) {
      const parts = data.replace("buy_", "").split("_");
      const prodId = parts[0];
      const qty = parts[1] ? parseInt(parts[1], 10) : 1;
      await initiateCheckout(telegram, orderService, chatId, user, prodId, qty);
      return NextResponse.json({ ok: true });
    }

    // Cliente informando que já transferiu pedido individual
    if (data.startsWith("informar_txid_")) {
      const pedidoId = data.replace("informar_txid_", "");
      const supabaseAdmin = createAdminClient();
      await supabaseAdmin
        .from("clientes")
        .update({ estado_conversa: `aguardando_txid:${pedidoId}` })
        .eq("telegram_id", user.id);

      await telegram.sendMessage({
        chat_id: chatId,
        text:
          `🧾 <b>Aguardando seu ID de Transação Binance</b>\n\n` +
          `Envie aqui no chat o <b>ID da Transação / Ordem</b> gerado no app da Binance referente ao envio de USDT para o UID <code>1257797463</code>:\n\n` +
          `<i>⚡ Assim que você enviar, o sistema verificará e entregará seus dados de acesso automaticamente!</i>\n\n` +
          `<i>(Caso queira cancelar, envie /cancelar)</i>`,
        parse_mode: "HTML",
      });
      return NextResponse.json({ ok: true });
    }

    // Cancelar pedido individual pendente
    if (data.startsWith("cancelar_pedido_")) {
      const pedidoId = data.replace("cancelar_pedido_", "");
      const supabaseAdmin = createAdminClient();
      await supabaseAdmin
        .from("pedidos")
        .update({ status_pagamento: "cancelado" })
        .eq("id", pedidoId)
        .eq("status_pagamento", "pendente");

      await supabaseAdmin
        .from("clientes")
        .update({ estado_conversa: null })
        .eq("telegram_id", user.id);

      await telegram.sendMessage({
        chat_id: chatId,
        text: "❌ <b>Pedido cancelado com sucesso.</b>\n\nPara explorar outros produtos, escolha uma categoria abaixo:",
        parse_mode: "HTML",
      });
      await renderCategories(telegram, chatId);
      return NextResponse.json({ ok: true });
    }

    // Ver meus pedidos
    if (data === "my_orders") {
      await renderUserOrders(telegram, chatId, user.id, messageId);
      return NextResponse.json({ ok: true });
    }

    // Suporte
    if (data === "support") {
      await telegram.sendMessage({
        chat_id: chatId,
        text:
          `🗣️ <b>Suporte ao Cliente</b>\n\n` +
          `Acompanhe atualizações e novidades em ${process.env.TELEGRAM_PUBLIC_CHANNEL_ID || "@ventedigital_oficial_promo"}.\n` +
          `Para dúvidas com pedidos anteriores, acesse seu histórico em <b>📦 Meus Pedidos</b>.`,
        parse_mode: "HTML",
      });
      return NextResponse.json({ ok: true });
    }
  }

  return NextResponse.json({ ok: true });
}

// ============================================================================
// HELPERS DE RENDERIZAÇÃO DA LOJA NO TELEGRAM
// ============================================================================

/**
 * Renderiza o menu de categorias ativas com quantidade de produtos por categoria
 */
async function renderCategories(
  telegram: TelegramBotClient,
  chatId: number,
  messageId?: number
) {
  const supabase = createAdminClient();
  const { data: categorias } = await supabase
    .from("categorias")
    .select("id, nome, emoji, slug")
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (!categorias || categorias.length === 0) {
    await sendOrEdit(
      telegram,
      chatId,
      messageId,
      "🛍️ <b>Catálogo em Atualização</b>\n\nNenhuma categoria disponível no momento. Volte em instantes!",
      {
        inline_keyboard: [[{ text: "🔄 Atualizar", callback_data: "browse_cat" }]],
      }
    );
    return;
  }

  const { data: produtos } = await supabase
    .from("produtos")
    .select("categoria_id")
    .eq("ativo", true);

  const counts: Record<string, number> = {};
  for (const p of produtos || []) {
    if (p.categoria_id) {
      counts[p.categoria_id] = (counts[p.categoria_id] || 0) + 1;
    }
  }

  const buttons: { text: string; callback_data: string }[][] = [];

  for (let i = 0; i < categorias.length; i += 2) {
    const row = [];
    const cat1 = categorias[i];
    const c1 = counts[cat1.id] || 0;
    row.push({
      text: `${cat1.emoji || "📁"} ${cat1.nome} (${c1})`,
      callback_data: `cat_${cat1.id}_1`,
    });

    if (i + 1 < categorias.length) {
      const cat2 = categorias[i + 1];
      const c2 = counts[cat2.id] || 0;
      row.push({
        text: `${cat2.emoji || "📁"} ${cat2.nome} (${c2})`,
        callback_data: `cat_${cat2.id}_1`,
      });
    }
    buttons.push(row);
  }

  buttons.push([
    { text: "🔥 Mais Vendidos / Destaques", callback_data: "highlights" },
    { text: "🛒 Ver Meu Carrinho", callback_data: "view_cart" },
  ]);
  buttons.push([
    { text: "🔍 Buscar por Nome", callback_data: "prompt_search" },
    { text: "📦 Meus Pedidos", callback_data: "my_orders" },
  ]);

  const text =
    `🛍️ <b>Catálogo Oficial de Produtos Digitais</b>\n\n` +
    `Selecione uma categoria abaixo para navegar pelos produtos ou faça uma busca direta:\n\n` +
    `⚡ <i>Todos os produtos contam com compra múltipla, carrinho integrado e entrega 100% automática via Binance UID (USDT)!</i>`;

  await sendOrEdit(telegram, chatId, messageId, text, { inline_keyboard: buttons });
}

/**
 * Renderiza os produtos de uma categoria com paginação inteligente
 */
async function renderProductsInCategory(
  telegram: TelegramBotClient,
  chatId: number,
  catId: string,
  page: number = 1,
  messageId?: number
) {
  const pageSize = 6;
  const offset = (page - 1) * pageSize;
  const supabase = createAdminClient();

  const [{ data: categoria }, { data: produtos, count }] = await Promise.all([
    supabase.from("categorias").select("id, nome, emoji").eq("id", catId).maybeSingle(),
    supabase
      .from("produtos")
      .select("id, nome, emoji, preco_venda_usd, tipo_entrega, garantia_dias", { count: "exact" })
      .eq("categoria_id", catId)
      .eq("ativo", true)
      .order("nome", { ascending: true })
      .range(offset, offset + pageSize - 1),
  ]);

  if (!categoria) {
    await sendOrEdit(telegram, chatId, messageId, "⚠️ Categoria não encontrada.", {
      inline_keyboard: [[{ text: "⬅️ Voltar às Categorias", callback_data: "browse_cat" }]],
    });
    return;
  }

  const total = count || 0;
  const totalPages = Math.ceil(total / pageSize) || 1;

  if (!produtos || produtos.length === 0) {
    await sendOrEdit(
      telegram,
      chatId,
      messageId,
      `${categoria.emoji || "📁"} <b>${categoria.nome}</b>\n\nNenhum produto disponível nesta categoria no momento.`,
      {
        inline_keyboard: [[{ text: "⬅️ Voltar às Categorias", callback_data: "browse_cat" }]],
      }
    );
    return;
  }

  const buttons: { text: string; callback_data: string }[][] = [];

  for (const p of produtos) {
    const preco = Number(p.preco_venda_usd).toFixed(2);
    const nomeCurto = p.nome.length > 28 ? p.nome.slice(0, 26) + "…" : p.nome;
    buttons.push([
      {
        text: `${p.emoji || "🔹"} ${nomeCurto} — $${preco} USDT`,
        callback_data: `prod_${p.id}_1`,
      },
    ]);
  }

  // Linha de navegação e paginação
  const navRow: { text: string; callback_data: string }[] = [];
  if (page > 1) {
    navRow.push({ text: "⬅️ Anterior", callback_data: `cat_${catId}_${page - 1}` });
  }
  if (totalPages > 1) {
    navRow.push({ text: `📄 ${page}/${totalPages}`, callback_data: "noop" });
  }
  if (page < totalPages) {
    navRow.push({ text: "Próxima ➡️", callback_data: `cat_${catId}_${page + 1}` });
  }
  if (navRow.length > 0) {
    buttons.push(navRow);
  }

  buttons.push([
    { text: "🛒 Meu Carrinho", callback_data: "view_cart" },
    { text: "📁 Categorias", callback_data: "browse_cat" },
  ]);

  const text =
    `${categoria.emoji || "📁"} <b>${categoria.nome}</b>\n` +
    `<i>Mostrando ${produtos.length} de ${total} produtos (Página ${page}/${totalPages})</i>\n\n` +
    `Toque no item desejado para ver detalhes, escolher a quantidade e comprar:`;

  await sendOrEdit(telegram, chatId, messageId, text, { inline_keyboard: buttons });
}

/**
 * Renderiza os detalhes de um produto com seletor interativo de quantidade
 */
async function renderProductDetails(
  telegram: TelegramBotClient,
  chatId: number,
  produtoId: string,
  qty: number = 1,
  messageId?: number
) {
  const currentQty = Math.max(1, Math.min(100, Math.floor(qty) || 1));
  const supabase = createAdminClient();
  const { data: prod } = await supabase
    .from("produtos")
    .select("*, categoria:categorias(id, nome, emoji)")
    .eq("id", produtoId)
    .eq("ativo", true)
    .maybeSingle();

  if (!prod) {
    await sendOrEdit(telegram, chatId, messageId, "⚠️ Produto não encontrado ou indisponível.", {
      inline_keyboard: [[{ text: "⬅️ Voltar ao Catálogo", callback_data: "browse_cat" }]],
    });
    return;
  }

  const precoUnitario = Number(prod.preco_venda_usd);
  const totalUsdt = (precoUnitario * currentQty).toFixed(2);
  const unitUsdt = precoUnitario.toFixed(2);

  const entregaTexto =
    prod.tipo_entrega === "stock"
      ? "⚡ Imediata no Chat (Estoque Automático)"
      : prod.tipo_entrega === "activation"
      ? "🔑 Ativação Direta na sua Conta"
      : "🚀 Envio Digital Instantâneo";

  const estoqueTexto =
    prod.estoque_qtd !== null && prod.estoque_qtd > 0
      ? `✅ ${prod.estoque_qtd} unidades disponíveis`
      : "⚡ Disponível com entrega imediata";

  const categoriaNome = prod.categoria?.nome
    ? `${prod.categoria.emoji || "📁"} ${prod.categoria.nome}`
    : "Digital";

  const desc = prod.descricao
    ? prod.descricao.trim()
    : "Acesso oficial e exclusivo com suporte e garantia inclusos.";

  const text =
    `${prod.emoji || "🛍️"} <b>${prod.nome}</b>\n\n` +
    `📂 <b>Categoria:</b> ${categoriaNome}\n` +
    `💵 <b>Preço Unitário:</b> <b>$${unitUsdt} USDT</b>\n` +
    `🔢 <b>Quantidade Selecionada:</b> <b>${currentQty} unidade(s)</b>\n` +
    `💰 <b>Valor Total:</b> <b>$${totalUsdt} USDT</b>\n` +
    `⚡ <b>Entrega:</b> ${entregaTexto}\n` +
    `🛡️ <b>Garantia:</b> ${prod.garantia_dias || 30} dias\n` +
    `📦 <b>Estoque:</b> ${estoqueTexto}\n\n` +
    `📝 <b>Detalhes do Produto:</b>\n${desc}\n\n` +
    `═══════════════════════════\n` +
    `🔢 <b>Selecione ou ajuste a quantidade abaixo:</b>`;

  const decQty = Math.max(1, currentQty - 1);
  const incQty = Math.min(100, currentQty + 1);
  const backCallback = prod.categoria_id ? `cat_${prod.categoria_id}_1` : "browse_cat";

  const inline_keyboard: any[][] = [
    // Linha 1: Stepper ➖ / ➕
    [
      { text: "➖ 1", callback_data: `prod_${prod.id}_${decQty}` },
      { text: `📦 Qtd: ${currentQty}`, callback_data: "noop" },
      { text: "➕ 1", callback_data: `prod_${prod.id}_${incQty}` },
    ],
    // Linha 2: Quantidades pré-definidas rápidas
    [
      { text: "1x", callback_data: `prod_${prod.id}_1` },
      { text: "2x", callback_data: `prod_${prod.id}_2` },
      { text: "3x", callback_data: `prod_${prod.id}_3` },
      { text: "5x", callback_data: `prod_${prod.id}_5` },
      { text: "10x", callback_data: `prod_${prod.id}_10` },
    ],
    // Linha 3: Digitar quantidade customizada
    [
      { text: "✏️ Digitar Outra Quantidade", callback_data: `prompt_qty_${prod.id}` },
    ],
    // Linha 4: Comprar direto com essa quantidade
    [
      {
        text: `⚡ Comprar ${currentQty}x por $${totalUsdt} USDT`,
        callback_data: `buy_${prod.id}_${currentQty}`,
      },
    ],
    // Linha 5: Adicionar ao Carrinho para comprar múltiplos produtos
    [
      {
        text: `🛒 Adicionar ao Carrinho (${currentQty}x)`,
        callback_data: `add_cart_${prod.id}_${currentQty}`,
      },
    ],
    // Linha 6: Navegação
    [
      { text: "⬅️ Voltar à Lista", callback_data: backCallback },
      { text: "🛒 Ver Carrinho", callback_data: "view_cart" },
    ],
  ];

  await sendOrEdit(telegram, chatId, messageId, text, { inline_keyboard });
}

/**
 * Adiciona um produto e quantidade ao carrinho de compras do cliente
 */
async function addToCart(
  telegram: TelegramBotClient,
  chatId: number,
  user: any,
  produtoId: string,
  quantidade: number
) {
  const supabase = createAdminClient();
  const qty = Math.max(1, Math.min(100, Math.floor(quantidade) || 1));

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, carrinho")
    .eq("telegram_id", user.id)
    .maybeSingle();

  const { data: prod } = await supabase
    .from("produtos")
    .select("id, nome, emoji, preco_venda_usd")
    .eq("id", produtoId)
    .eq("ativo", true)
    .maybeSingle();

  if (!prod) {
    await telegram.sendMessage({
      chat_id: chatId,
      text: "⚠️ Produto não localizado.",
    });
    return;
  }

  let cart: Array<{ produto_id: string; quantidade: number }> = Array.isArray(cliente?.carrinho)
    ? cliente.carrinho
    : [];

  const existingIndex = cart.findIndex((item) => item.produto_id === produtoId);
  if (existingIndex >= 0) {
    cart[existingIndex].quantidade += qty;
  } else {
    cart.push({ produto_id: produtoId, quantidade: qty });
  }

  await supabase
    .from("clientes")
    .update({ carrinho: cart })
    .eq("telegram_id", user.id);

  const subtotal = (Number(prod.preco_venda_usd) * qty).toFixed(2);

  await telegram.sendMessage({
    chat_id: chatId,
    text:
      `✅ <b>Item adicionado ao carrinho!</b>\n\n` +
      `📦 <b>${qty}x ${prod.emoji || "🔹"} ${prod.nome}</b>\n` +
      `💰 Subtotal deste item: <b>$${subtotal} USDT</b>\n\n` +
      `Você pode continuar explorando outros itens ou ir para o carrinho para finalizar a compra:`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🛒 Ver Meu Carrinho", callback_data: "view_cart" }],
        [{ text: "🛍️ Continuar Comprando", callback_data: "browse_cat" }],
      ],
    },
  });
}

/**
 * Renderiza o carrinho de compras com todos os produtos, quantidades e valores
 */
async function renderCart(
  telegram: TelegramBotClient,
  chatId: number,
  telegramId: number,
  messageId?: number
) {
  const supabase = createAdminClient();
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, carrinho")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  const cart: Array<{ produto_id: string; quantidade: number }> = Array.isArray(cliente?.carrinho)
    ? cliente.carrinho
    : [];

  if (cart.length === 0) {
    await sendOrEdit(
      telegram,
      chatId,
      messageId,
      `🛒 <b>Seu Carrinho está Vazio</b>\n\n` +
        `Você ainda não adicionou produtos ao carrinho.\n` +
        `Navegue pelo nosso catálogo e adicione itens para comprar juntos:`,
      {
        inline_keyboard: [
          [{ text: "🛍️ Ver Catálogo", callback_data: "browse_cat" }],
          [{ text: "🔥 Destaques", callback_data: "highlights" }],
        ],
      }
    );
    return;
  }

  const prodIds = cart.map((i) => i.produto_id);
  const { data: produtos } = await supabase
    .from("produtos")
    .select("id, nome, emoji, preco_venda_usd")
    .in("id", prodIds);

  const prodMap = new Map((produtos || []).map((p) => [p.id, p]));

  let totalGeralUsdt = 0;
  let totalItens = 0;
  let text = `🛒 <b>Seu Carrinho de Compras</b>\n\n`;

  let idx = 1;
  for (const item of cart) {
    const prod = prodMap.get(item.produto_id);
    if (!prod) continue;

    const unit = Number(prod.preco_venda_usd);
    const sub = unit * item.quantidade;
    totalGeralUsdt += sub;
    totalItens += item.quantidade;

    text += `<b>${idx}.</b> ${prod.emoji || "🔹"} <b>${prod.nome}</b>\n`;
    text += `   • <b>Qtd:</b> ${item.quantidade}x • <b>Unit:</b> $${unit.toFixed(2)} • <b>Subtotal:</b> $${sub.toFixed(2)} USDT\n\n`;
    idx++;
  }

  text += `═══════════════════════════\n`;
  text += `🔢 <b>Total de Itens:</b> ${totalItens} unidade(s)\n`;
  text += `💰 <b>TOTAL GERAL:</b> <b>$${totalGeralUsdt.toFixed(2)} USDT</b>\n`;
  text += `═══════════════════════════\n\n`;
  text += `<i>Pagamento único via Binance UID com entrega 100% automática de todos os itens!</i>`;

  const totalFormatted = totalGeralUsdt.toFixed(2);

  await sendOrEdit(telegram, chatId, messageId, text, {
    inline_keyboard: [
      [
        {
          text: `⚡ Finalizar Compra ($${totalFormatted} USDT)`,
          callback_data: "checkout_cart",
        },
      ],
      [
        { text: "🛍️ Adicionar Mais Produtos", callback_data: "browse_cat" },
        { text: "🗑️ Limpar Carrinho", callback_data: "clear_cart" },
      ],
    ],
  });
}

/**
 * Esvazia o carrinho de compras do cliente
 */
async function clearCart(
  telegram: TelegramBotClient,
  chatId: number,
  telegramId: number,
  messageId?: number
) {
  const supabase = createAdminClient();
  await supabase
    .from("clientes")
    .update({ carrinho: [] })
    .eq("telegram_id", telegramId);

  await sendOrEdit(
    telegram,
    chatId,
    messageId,
    "🗑️ <b>Carrinho esvaziado com sucesso!</b>\n\nNavegue pelas categorias para selecionar novos produtos:",
    {
      inline_keyboard: [
        [{ text: "🛍️ Ver Catálogo", callback_data: "browse_cat" }],
        [{ text: "🔥 Destaques", callback_data: "highlights" }],
      ],
    }
  );
}

/**
 * Executa o checkout do carrinho completo criando os pedidos atômicos
 */
async function checkoutCart(
  telegram: TelegramBotClient,
  orderService: OrderService,
  chatId: number,
  user: any
) {
  const supabase = createAdminClient();
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, carrinho")
    .eq("telegram_id", user.id)
    .maybeSingle();

  const cart: Array<{ produto_id: string; quantidade: number }> = Array.isArray(cliente?.carrinho)
    ? cliente.carrinho
    : [];

  if (cart.length === 0) {
    await telegram.sendMessage({
      chat_id: chatId,
      text: "🛒 Seu carrinho está vazio.",
    });
    return;
  }

  const createdOrders: any[] = [];
  for (const item of cart) {
    try {
      const orderData = await orderService.createOrder({
        telegramId: user.id,
        username: user.username,
        firstName: user.first_name,
        produtoId: item.produto_id,
        quantidade: item.quantidade,
        metodoPagamento: "binance_id",
      });
      createdOrders.push(orderData);
    } catch (e: any) {
      console.error("[Cart Checkout] Erro ao criar pedido de item do carrinho:", e);
    }
  }

  if (createdOrders.length === 0) {
    await telegram.sendMessage({
      chat_id: chatId,
      text: "❌ Não foi possível gerar os pedidos do carrinho. Tente novamente mais tarde.",
    });
    return;
  }

  const pedidoIds = createdOrders.map((o) => o.pedido_id);
  const totalUsdt = createdOrders
    .reduce((acc, o) => acc + Number(o.total_usd), 0)
    .toFixed(2);

  // Armazena estado da conversa para aguardar TxID do lote
  await supabase
    .from("clientes")
    .update({ estado_conversa: `aguardando_txid_cart:${pedidoIds.join(",")}` })
    .eq("telegram_id", user.id);

  const { data: configRow } = await supabase
    .from("configuracoes")
    .select("valor")
    .eq("chave", "binance_id")
    .maybeSingle();

  const binanceUid = configRow?.valor || "1257797463";

  let resumoItens = "";
  for (const o of createdOrders) {
    resumoItens += `• <b>${o.quantidade || 1}x</b> ${o.produto_nome} ($${Number(o.total_usd).toFixed(2)} USDT)\n`;
  }

  const text =
    `🧾 <b>FATURA DO CARRINHO (${createdOrders.length} PRODUTOS)</b>\n\n` +
    `📦 <b>Itens Inclusos no Pedido:</b>\n` +
    `${resumoItens}\n` +
    `💰 <b>Valor Total a Pagar:</b> <b>$${totalUsdt} USDT</b>\n\n` +
    `═══════════════════════════\n` +
    `📱 <b>DADOS DE PAGAMENTO (BINANCE)</b>\n` +
    `═══════════════════════════\n` +
    `🆔 <b>Binance UID de Destino:</b>\n` +
    `<code>${binanceUid}</code>\n` +
    `<i>(Toque no número acima para copiar automaticamente)</i>\n\n` +
    `💵 <b>Moeda:</b> USDT\n` +
    `🏷️ <b>Valor Exato:</b> <code>${totalUsdt}</code> USDT\n\n` +
    `<b>Como transferir no app da Binance:</b>\n` +
    `1. Abra o app <b>Binance</b> no celular\n` +
    `2. Toque em <b>Pagar / Pay</b> (ou Carteira > Enviar > Enviar por ID)\n` +
    `3. Cole o UID: <code>${binanceUid}</code>\n` +
    `4. Digite o valor exato: <b>${totalUsdt} USDT</b>\n` +
    `5. Conclua a transferência (0% de taxa)\n` +
    `6. Copie o <b>ID da Transação / Ordem</b> gerado no comprovante\n\n` +
    `═══════════════════════════\n` +
    `⚡ <b>ENTREGA 100% AUTOMÁTICA</b>\n` +
    `═══════════════════════════\n` +
    `Assim que concluir o envio na Binance, clique no botão verde abaixo e envie o código. Todos os ${createdOrders.length} produtos serão entregues juntos <b>na hora</b> aqui nesta conversa!`;

  await telegram.sendMessage({
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "⚡ Já transferi! Informar ID da Transação",
            callback_data: "informar_txid_cart",
          },
        ],
        [
          {
            text: "❌ Cancelar",
            callback_data: "cancelar_cart",
          },
        ],
      ],
    },
  });
}

/**
 * Renderiza produtos mais procurados / destaques
 */
async function renderHighlights(
  telegram: TelegramBotClient,
  chatId: number,
  messageId?: number
) {
  const supabase = createAdminClient();
  const { data: produtos } = await supabase
    .from("produtos")
    .select("id, nome, emoji, preco_venda_usd")
    .eq("ativo", true)
    .in("nome", [
      "Gemini 18 Months",
      "Claude 100$ Api 30 D warranty",
      "YouTube Premium 3 Months",
      "Chatgpt plus UPI (No warranty) Gmail",
      "Elevenlabs - Free 10k Credits (W24H)",
      "NordVpn 3 Months Basic",
      "Notion Business 3 Months",
      "CursorPro+GrokBot+S.Grok+X Premium+12m(FW)",
    ])
    .limit(8);

  let destaques = produtos || [];
  if (destaques.length < 4) {
    const { data: fallback } = await supabase
      .from("produtos")
      .select("id, nome, emoji, preco_venda_usd")
      .eq("ativo", true)
      .order("preco_venda_usd", { ascending: true })
      .limit(8);
    destaques = fallback || [];
  }

  const buttons: { text: string; callback_data: string }[][] = destaques.map((p) => [
    {
      text: `${p.emoji || "🔥"} ${p.nome.length > 28 ? p.nome.slice(0, 26) + "…" : p.nome} — $${Number(p.preco_venda_usd).toFixed(2)} USDT`,
      callback_data: `prod_${p.id}_1`,
    },
  ]);

  buttons.push([
    { text: "📁 Ver Categorias", callback_data: "browse_cat" },
    { text: "🛒 Meu Carrinho", callback_data: "view_cart" },
  ]);

  const text =
    `🔥 <b>Produtos Mais Vendidos & Destaques</b>\n\n` +
    `Confira os produtos mais procurados da nossa loja com preços imperdíveis em USDT e entrega imediata no chat:\n\n` +
    `<i>Toque em qualquer item para ver detalhes, escolher a quantidade e comprar:</i>`;

  await sendOrEdit(telegram, chatId, messageId, text, { inline_keyboard: buttons });
}

/**
 * Renderiza resultados de pesquisa no catálogo
 */
async function renderSearchResults(
  telegram: TelegramBotClient,
  chatId: number,
  termo: string
) {
  const supabase = createAdminClient();
  const termoLimpo = termo.trim();

  const { data: produtos } = await supabase
    .from("produtos")
    .select("id, nome, emoji, preco_venda_usd, descricao")
    .eq("ativo", true)
    .or(`nome.ilike.%${termoLimpo}%,descricao.ilike.%${termoLimpo}%`)
    .limit(8);

  if (!produtos || produtos.length === 0) {
    await telegram.sendMessage({
      chat_id: chatId,
      text:
        `🔍 <b>Nenhum produto encontrado para:</b> "<code>${termoLimpo}</code>"\n\n` +
        `💡 <i>Dica: Tente pesquisar por termos como Claude, Gemini, ChatGPT, Notion, VPN, YouTube, CapCut...</i>`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔍 Tentar Outra Busca", callback_data: "prompt_search" }],
          [{ text: "📁 Explorar Categorias", callback_data: "browse_cat" }],
        ],
      },
    });
    return;
  }

  const buttons = produtos.map((p) => [
    {
      text: `${p.emoji || "🔍"} ${p.nome.length > 28 ? p.nome.slice(0, 26) + "…" : p.nome} — $${Number(p.preco_venda_usd).toFixed(2)} USDT`,
      callback_data: `prod_${p.id}_1`,
    },
  ]);

  buttons.push([
    { text: "🔍 Nova Busca", callback_data: "prompt_search" },
    { text: "📁 Ver Categorias", callback_data: "browse_cat" },
  ]);

  await telegram.sendMessage({
    chat_id: chatId,
    text: `🔍 <b>Encontramos ${produtos.length} produto(s) para "${termoLimpo}":</b>\n\nToque no item desejado para comprar ou ajustar quantidade:`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
  });
}

/**
 * Inicia o checkout gerando pedido atômico para uma quantidade específica
 */
async function initiateCheckout(
  telegram: TelegramBotClient,
  orderService: OrderService,
  chatId: number,
  user: any,
  produtoId: string,
  quantidade: number = 1
) {
  try {
    const qty = Math.max(1, Math.min(100, Math.floor(quantidade) || 1));
    const orderData = await orderService.createOrder({
      telegramId: user.id,
      username: user.username,
      firstName: user.first_name,
      produtoId,
      quantidade: qty,
      metodoPagamento: "binance_id",
    });

    const supabase = createAdminClient();
    const { data: configRow } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", "binance_id")
      .maybeSingle();

    const binanceUid = configRow?.valor || "1257797463";
    const totalUsdt = Number(orderData.total_usd).toFixed(2);
    const precoUnitario = (Number(orderData.total_usd) / qty).toFixed(2);

    const text =
      `🧾 <b>FATURA DO PEDIDO: ${orderData.referencia_unica}</b>\n\n` +
      `📦 <b>Produto:</b> ${orderData.produto_nome}\n` +
      `🔢 <b>Quantidade:</b> <b>${qty} unidade(s)</b>\n` +
      `💵 <b>Preço Unitário:</b> $${precoUnitario} USDT\n` +
      `💰 <b>Valor Total a Pagar:</b> <b>$${totalUsdt} USDT</b>\n\n` +
      `═══════════════════════════\n` +
      `📱 <b>DADOS DE PAGAMENTO (BINANCE)</b>\n` +
      `═══════════════════════════\n` +
      `🆔 <b>Binance UID de Destino:</b>\n` +
      `<code>${binanceUid}</code>\n` +
      `<i>(Toque no número acima para copiar automaticamente)</i>\n\n` +
      `💵 <b>Moeda:</b> USDT\n` +
      `🏷️ <b>Valor Exato:</b> <code>${totalUsdt}</code> USDT\n\n` +
      `<b>Como transferir no app da Binance:</b>\n` +
      `1. Abra o app <b>Binance</b> no celular\n` +
      `2. Toque em <b>Pagar / Pay</b> (ou Carteira > Enviar > Enviar por ID)\n` +
      `3. Cole o UID: <code>${binanceUid}</code>\n` +
      `4. Digite o valor exato: <b>${totalUsdt} USDT</b>\n` +
      `5. Conclua o envio (taxa 0!)\n` +
      `6. Copie o <b>ID da Transação / Ordem</b> que aparece no comprovante\n\n` +
      `═══════════════════════════\n` +
      `⚡ <b>ENTREGA 100% AUTOMÁTICA</b>\n` +
      `═══════════════════════════\n` +
      `Assim que você transferir, toque no botão verde abaixo e envie o ID da transação. Seus ${qty} acesso(s) serão enviados <b>na hora</b> aqui nesta conversa!`;

    await telegram.sendMessage({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "⚡ Já transferi! Informar ID da Transação",
              callback_data: `informar_txid_${orderData.pedido_id}`,
            },
          ],
          [
            {
              text: "❌ Cancelar Pedido",
              callback_data: `cancelar_pedido_${orderData.pedido_id}`,
            },
          ],
        ],
      },
    });
  } catch (err: any) {
    await telegram.sendMessage({
      chat_id: chatId,
      text: `❌ <b>Não foi possível gerar o pedido:</b> ${err.message || "Tente novamente mais tarde."}`,
      parse_mode: "HTML",
    });
  }
}

/**
 * Renderiza o histórico de pedidos do cliente com licenças e credenciais entregues
 */
async function renderUserOrders(
  telegram: TelegramBotClient,
  chatId: number,
  telegramId: number,
  messageId?: number
) {
  const supabase = createAdminClient();
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (!cliente) {
    await sendOrEdit(
      telegram,
      chatId,
      messageId,
      "📦 <b>Meus Pedidos</b>\n\nVocê ainda não realizou nenhum pedido em nossa loja.\nUse o botão abaixo para conferir as novidades!",
      {
        inline_keyboard: [[{ text: "🛍️ Explorar Catálogo", callback_data: "browse_cat" }]],
      }
    );
    return;
  }

  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("*, produto:produtos(nome, emoji)")
    .eq("cliente_id", cliente.id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!pedidos || pedidos.length === 0) {
    await sendOrEdit(
      telegram,
      chatId,
      messageId,
      "📦 <b>Meus Pedidos</b>\n\nVocê ainda não possui pedidos recentes em nossa loja.",
      {
        inline_keyboard: [[{ text: "🛍️ Explorar Catálogo", callback_data: "browse_cat" }]],
      }
    );
    return;
  }

  let text = "📦 <b>Seus Últimos Pedidos:</b>\n\n";
  for (const p of pedidos) {
    const dataFormatada = new Date(p.created_at).toLocaleDateString("pt-BR");
    const statusIcon =
      p.status_entrega === "entregue"
        ? "✅ Entregue"
        : p.status_pagamento === "pago"
        ? "⏳ Em processamento"
        : p.status_pagamento === "cancelado"
        ? "❌ Cancelado"
        : "⚠️ Aguardando pagamento";

    const prodNome = p.produto?.nome || "Produto Digital";
    const prodEmoji = p.produto?.emoji || "🔹";
    const qtd = p.quantidade || 1;

    text += `${prodEmoji} <b>${prodNome}</b> (${qtd}x)\n`;
    text += `• <b>Ref:</b> <code>${p.referencia_unica}</code>\n`;
    text += `• <b>Status:</b> ${statusIcon}\n`;
    text += `• <b>Total:</b> $${Number(p.total_usd).toFixed(2)} USDT\n`;
    text += `• <b>Data:</b> ${dataFormatada}\n`;

    if (p.conteudo_entregue && p.status_entrega === "entregue") {
      text += `• <b>Acesso / Licença Entregue:</b>\n<pre>${p.conteudo_entregue}</pre>\n`;
    }
    text += "───────────────────────────\n";
  }

  await sendOrEdit(telegram, chatId, messageId, text, {
    inline_keyboard: [
      [{ text: "🛍️ Continuar Comprando", callback_data: "browse_cat" }],
      [{ text: "🛒 Meu Carrinho", callback_data: "view_cart" }],
      [{ text: "🗣️ Suporte", callback_data: "support" }],
    ],
  });
}
