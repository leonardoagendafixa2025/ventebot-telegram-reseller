import { NextRequest, NextResponse } from "next/server";
import { TelegramBotClient } from "@/lib/telegram/client";
import { TelegramUpdate } from "@/lib/telegram/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrderService } from "@/lib/services/order-service";

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

  // 1. Tratamento de Pre-Checkout Query (Validação prévia do Telegram Stars)
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

      // Tudo validado com sucesso!
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

  // 2. Tratamento de Pagamento Confirmado (Successful Payment)
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

  // Teclado fixo persistente
  const mainKeyboard = {
    keyboard: [
      [{ text: "🛍️ Produtos" }, [{ text: "📦 Meus pedidos" }]],
      [{ text: "👤 Minha conta" }, { text: "🗣️ Suporte" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };

  // 3. Tratamento de Adição a Grupos/Canais (my_chat_member)
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

  // 4. Tratamento de Comandos e Mensagens de Texto (Mensagens e Posts de Canal)
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

    // 4.1 Verifica se o cliente está aguardando envio do ID da transação da Binance
    const { data: clienteAtual } = await supabase
      .from("clientes")
      .select("id, estado_conversa")
      .eq("telegram_id", user.id)
      .maybeSingle();

    if (clienteAtual?.estado_conversa?.startsWith("aguardando_txid:")) {
      const pedidoId = clienteAtual.estado_conversa.replace("aguardando_txid:", "");

      // Limpa estado da conversa
      await supabase
        .from("clientes")
        .update({ estado_conversa: null })
        .eq("telegram_id", user.id);

      const txId = text.replace(/[^a-zA-Z0-9_-]/g, "").trim();

      if (!txId || txId.length < 5) {
        await telegram.sendMessage({
          chat_id: chatId,
          text: `⚠️ <b>Código muito curto ou inválido.</b>\n\nPor favor, envie o ID da transação ou ordem gerado pela Binance. Clique abaixo para tentar novamente:`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "⚡ Tentar Novamente", callback_data: `informar_txid_${pedidoId}` }],
            ],
          },
        });
        return NextResponse.json({ ok: true });
      }

      // Verificação Anti-Fraude (Anti-Replay): Garante que esse TxID nunca foi usado em outro pedido
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
        });
        return NextResponse.json({ ok: true });
      }

      // Notifica o cliente que a verificação e entrega estão ocorrendo
      await telegram.sendMessage({
        chat_id: chatId,
        text: `⏳ <b>Transação Binance recebida:</b> <code>${txId}</code>\n\nProcessando pagamento e liberando seu acesso 100% automático...`,
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

        // Confirmação atômica no banco + chamada ao fornecedor + entrega na conversa!
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
          text: `⚠️ <b>Recebemos seu ID (<code>${txId}</code>)!</b>\n\nO sistema está finalizando a geração da sua licença com o fornecedor. Se demorar mais de 1 minuto, verifique em <b>Meus Pedidos</b> ou fale com o suporte.`,
          parse_mode: "HTML",
        });
      }

      return NextResponse.json({ ok: true });
    }

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

    // Deep link: /start prod_<id>
    if (text.startsWith("/start prod_")) {
      const prodId = text.replace("/start prod_", "").trim();
      await renderProductDetails(telegram, chatId, prodId);
      return NextResponse.json({ ok: true });
    }

    if (text === "/start" || text === "🏠 Início") {
      await telegram.sendMessage({
        chat_id: chatId,
        text: `👋 Olá, <b>${user.first_name || "Cliente"}</b>!\n\nBem-vindo à nossa loja digital oficial no Telegram!\nAqui você encontra produtos digitais com entrega 100% automática e pagamento facilitado via <b>Binance UID (USDT)</b> ⚡.\n\nEscolha uma opção no menu abaixo para começar:`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🛍️ Ver Catálogo Completo", callback_data: "browse_cat" }],
            [{ text: "📦 Meus Pedidos", callback_data: "my_orders" }],
            [{ text: "🗣️ Atendimento & Suporte", callback_data: "support" }],
          ],
        },
      });
      return NextResponse.json({ ok: true });
    }

    if (text === "/products" || text === "🛍️ Produtos") {
      await renderCategories(telegram, chatId);
      return NextResponse.json({ ok: true });
    }

    if (text === "/orders" || text === "📦 Meus pedidos") {
      await renderUserOrders(telegram, chatId, user.id);
      return NextResponse.json({ ok: true });
    }

    if (text === "/support" || text === "🗣️ Suporte") {
      await telegram.sendMessage({
        chat_id: chatId,
        text: `🗣️ <b>Central de Atendimento & Suporte</b>\n\nPrecisa de ajuda com algum pedido ou dúvida sobre os produtos?\n\n• Canal oficial: ${process.env.TELEGRAM_PUBLIC_CHANNEL_ID || "@canal_loja"}\n• Suporte humanizado: Digite sua dúvida ou envie seu número de pedido.\n• Garantia: Todos os produtos contam com garantia informada na compra.`,
        parse_mode: "HTML",
      });
      return NextResponse.json({ ok: true });
    }

    if (text === "👤 Minha conta") {
      await telegram.sendMessage({
        chat_id: chatId,
        text: `👤 <b>Minha Conta</b>\n\n• ID Telegram: <code>${user.id}</code>\n• Usuário: @${user.username || "não informado"}\n• Método de Pagamento: <b>Binance UID (USDT)</b>\n• Entrega: <b>100% Automática</b>\n\nTodas as suas compras contam com entrega imediata e suporte!`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📦 Ver Meus Pedidos", callback_data: "my_orders" }],
            [{ text: "🛍️ Explorar Catálogo", callback_data: "browse_cat" }],
          ],
        },
      });
      return NextResponse.json({ ok: true });
    }
  }

  // 4. Tratamento de Callbacks de Botões Inline
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = cb.data || "";
    const chatId = cb.message?.chat.id;
    const user = cb.from;

    await telegram.answerCallbackQuery({ callback_query_id: cb.id });
    if (!chatId) return NextResponse.json({ ok: true });

    if (data === "browse_cat") {
      await renderCategories(telegram, chatId);
      return NextResponse.json({ ok: true });
    }

    if (data.startsWith("cat_")) {
      const catId = data.replace("cat_", "");
      await renderProductsInCategory(telegram, chatId, catId);
      return NextResponse.json({ ok: true });
    }

    if (data.startsWith("prod_")) {
      const prodId = data.replace("prod_", "");
      await renderProductDetails(telegram, chatId, prodId);
      return NextResponse.json({ ok: true });
    }

    if (data.startsWith("buy_")) {
      const prodId = data.replace("buy_", "");
      await initiateCheckout(telegram, orderService, chatId, user, prodId);
      return NextResponse.json({ ok: true });
    }

    if (data.startsWith("informar_txid_")) {
      const pedidoId = data.replace("informar_txid_", "");
      const supabaseAdmin = createAdminClient();
      await supabaseAdmin
        .from("clientes")
        .update({ estado_conversa: `aguardando_txid:${pedidoId}` })
        .eq("telegram_id", user.id);

      await telegram.sendMessage({
        chat_id: chatId,
        text: `🧾 <b>Confirmação de Pagamento Binance (Entrega 100% Automática)</b>\n\n` +
          `Envie aqui no chat o <b>ID da Transação / Ordem</b> gerado no seu app da Binance após você transferir para o UID <code>1257797463</code>.\n\n` +
          `<i>⚡ Assim que você digitar ou colar o código aqui, sua entrega será feita na hora automaticamente!</i>`,
        parse_mode: "HTML",
      });
      return NextResponse.json({ ok: true });
    }

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
        text: "❌ Pedido cancelado com sucesso. Para ver outros produtos, digite /products.",
      });
      return NextResponse.json({ ok: true });
    }

    if (data === "my_orders") {
      await renderUserOrders(telegram, chatId, user.id);
      return NextResponse.json({ ok: true });
    }

    if (data === "support") {
      await telegram.sendMessage({
        chat_id: chatId,
        text: `🗣️ <b>Suporte ao Cliente</b>\n\nEntre em contato pelo canal oficial ${process.env.TELEGRAM_PUBLIC_CHANNEL_ID || ""} para obter auxílio com ativações ou reposições.`,
        parse_mode: "HTML",
      });
      return NextResponse.json({ ok: true });
    }
  }

  return NextResponse.json({ ok: true });
}

// Helpers de Renderização no Telegram

async function renderCategories(telegram: TelegramBotClient, chatId: number) {
  const supabase = createAdminClient();
  const { data: categorias } = await supabase
    .from("categorias")
    .select("id, nome, emoji")
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (!categorias || categorias.length === 0) {
    await telegram.sendMessage({
      chat_id: chatId,
      text: "🛍️ <b>Catálogo em atualização</b>\n\nNenhuma categoria disponível no momento. Volte em instantes!",
      parse_mode: "HTML",
    });
    return;
  }

  const buttons = categorias.map((cat) => [
    {
      text: `${cat.emoji || "📁"} ${cat.nome}`,
      callback_data: `cat_${cat.id}`,
    },
  ]);

  await telegram.sendMessage({
    chat_id: chatId,
    text: "🛍️ <b>Categorias Disponíveis:</b>\nSelecione uma categoria para visualizar os produtos:",
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function renderProductsInCategory(
  telegram: TelegramBotClient,
  chatId: number,
  categoriaId: string
) {
  const supabase = createAdminClient();
  const { data: produtos } = await supabase
    .from("produtos")
    .select("id, nome, emoji, preco_venda_usd, preco_venda_stars, tipo_entrega")
    .eq("categoria_id", categoriaId)
    .eq("ativo", true)
    .order("nome", { ascending: true });

  if (!produtos || produtos.length === 0) {
    await telegram.sendMessage({
      chat_id: chatId,
      text: "📦 Não há produtos disponíveis nesta categoria no momento.",
      reply_markup: {
        inline_keyboard: [[{ text: "⬅️ Voltar às Categorias", callback_data: "browse_cat" }]],
      },
    });
    return;
  }

  const buttons = produtos.map((p) => [
    {
      text: `${p.emoji || "🔹"} ${p.nome} — $${Number(p.preco_venda_usd).toFixed(2)} USDT`,
      callback_data: `prod_${p.id}`,
    },
  ]);
  buttons.push([{ text: "⬅️ Voltar às Categorias", callback_data: "browse_cat" }]);

  await telegram.sendMessage({
    chat_id: chatId,
    text: "📦 <b>Produtos Disponíveis:</b>\nEscolha um item para ver detalhes e comprar:",
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function renderProductDetails(
  telegram: TelegramBotClient,
  chatId: number,
  produtoId: string
) {
  const supabase = createAdminClient();
  const { data: prod } = await supabase
    .from("produtos")
    .select("*")
    .eq("id", produtoId)
    .eq("ativo", true)
    .maybeSingle();

  if (!prod) {
    await telegram.sendMessage({
      chat_id: chatId,
      text: "⚠️ Produto não encontrado ou indisponível.",
    });
    return;
  }

  const entregaTexto =
    prod.tipo_entrega === "stock"
      ? "⚡ Entrega Imediata (Estoque Automático)"
      : prod.tipo_entrega === "activation"
      ? "🔑 Ativação Direta na sua Conta"
      : "🚀 Envio Digital Instantâneo";

  const estoqueTexto =
    prod.estoque_qtd !== null ? `📦 Estoque: ${prod.estoque_qtd} unidades` : "📦 Estoque: Disponível sob demanda";

  const totalUsdt = Number(prod.preco_venda_usd).toFixed(2);
  const text = `${prod.emoji || "🛍️"} <b>${prod.nome}</b>\n\n${prod.descricao || "Sem descrição disponível."}\n\n<b>Preço:</b> <b>$${totalUsdt} USDT</b>\n<b>Entrega:</b> ${entregaTexto}\n<b>Garantia:</b> ${prod.garantia_dias} dias\n${estoqueTexto}`;

  await telegram.sendMessage({
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: `🛒 Comprar por $${totalUsdt} USDT`, callback_data: `buy_${prod.id}` }],
        [{ text: "⬅️ Voltar às Categorias", callback_data: "browse_cat" }],
      ],
    },
  });
}

async function initiateCheckout(
  telegram: TelegramBotClient,
  orderService: OrderService,
  chatId: number,
  user: any,
  produtoId: string
) {
  try {
    // 1. Cria pedido com preço congelado via Binance ID
    const orderData = await orderService.createOrder({
      telegramId: user.id,
      username: user.username,
      firstName: user.first_name,
      produtoId,
      quantidade: 1,
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

    await telegram.sendMessage({
      chat_id: chatId,
      text: `🛒 <b>Fatura de Compra: ${orderData.produto_nome}</b>\n\n` +
        `🔖 <b>Pedido:</b> <code>${orderData.referencia_unica}</code>\n` +
        `📦 <b>Produto:</b> ${orderData.produto_nome}\n` +
        `💰 <b>Valor a Pagar:</b> <b>${totalUsdt} USDT</b>\n\n` +
        `═══════════════════════════\n` +
        `📱 <b>DADOS DE PAGAMENTO (BINANCE UID)</b>\n` +
        `═══════════════════════════\n` +
        `🆔 <b>Binance UID de Destino:</b>\n` +
        `<code>${binanceUid}</code> <i>(toque no número para copiar)</i>\n\n` +
        `💵 <b>Moeda:</b> USDT\n\n` +
        `<b>Instruções no App da Binance:</b>\n` +
        `1. Abra seu aplicativo da <b>Binance</b>\n` +
        `2. Vá em <b>Pagar</b> (ou Carteira > Enviar)\n` +
        `3. Escolha <b>Enviar por ID / Binance UID</b>\n` +
        `4. Cole o UID: <code>${binanceUid}</code>\n` +
        `5. Digite o valor exato: <b>${totalUsdt} USDT</b>\n` +
        `6. Conclua a transferência (0% de taxa!)\n\n` +
        `⚡ <b>ENTREGA 100% AUTOMÁTICA:</b>\n` +
        `Assim que concluir o envio, clique no botão abaixo para informar o ID da transação e seu produto será entregue na hora!`,
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

async function renderUserOrders(
  telegram: TelegramBotClient,
  chatId: number,
  telegramId: number
) {
  const supabase = createAdminClient();
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (!cliente) {
    await telegram.sendMessage({
      chat_id: chatId,
      text: "📦 Você ainda não realizou nenhum pedido em nossa loja.",
    });
    return;
  }

  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("*, produto:produtos(nome)")
    .eq("cliente_id", cliente.id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!pedidos || pedidos.length === 0) {
    await telegram.sendMessage({
      chat_id: chatId,
      text: "📦 Você ainda não possui pedidos recentes.",
    });
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
        : "⚠️ Pagamento pendente";

    text += `🔹 <b>${p.produto?.nome || "Produto"}</b>\n• Ref: <code>${p.referencia_unica}</code>\n• Status: ${statusIcon}\n• Total: $${Number(p.total_usd).toFixed(2)} USDT\n• Data: ${dataFormatada}\n`;

    if (p.conteudo_entregue && p.status_entrega === "entregue") {
      text += `• Conteúdo entregue:\n<pre>${p.conteudo_entregue}</pre>\n`;
    }
    text += "\n";
  }

  await telegram.sendMessage({
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  });
}
