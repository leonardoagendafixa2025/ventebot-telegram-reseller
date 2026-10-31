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

  // 3. Tratamento de Comandos e Mensagens de Texto
  if (update.message?.text) {
    const msg = update.message;
    const text = (msg.text || "").trim();
    const chatId = msg.chat.id;
    const user = msg.from;

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

    // Deep link: /start prod_<id>
    if (text.startsWith("/start prod_")) {
      const prodId = text.replace("/start prod_", "").trim();
      await renderProductDetails(telegram, chatId, prodId);
      return NextResponse.json({ ok: true });
    }

    if (text === "/start" || text === "🏠 Início") {
      await telegram.sendMessage({
        chat_id: chatId,
        text: `👋 Olá, <b>${user.first_name || "Cliente"}</b>!\n\nBem-vindo à nossa loja digital oficial no Telegram!\nAqui você encontra produtos digitais com entrega automática e pagamento facilitado via <b>Telegram Stars</b> ⭐.\n\nEscolha uma opção no menu abaixo para começar:`,
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
      const { data: cliente } = await supabase
        .from("clientes")
        .select("saldo_carteira_stars, created_at")
        .eq("telegram_id", user.id)
        .maybeSingle();

      const saldo = cliente?.saldo_carteira_stars || 0;
      await telegram.sendMessage({
        chat_id: chatId,
        text: `👤 <b>Minha Conta</b>\n\n• ID Telegram: <code>${user.id}</code>\n• Usuário: @${user.username || "não informado"}\n• Saldo em Créditos: <b>${saldo} ⭐ Stars</b>\n\nPagamentos de compras digitais são processados diretamente com Telegram Stars na hora da confirmação.`,
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
      text: `${p.emoji || "🔹"} ${p.nome} — ${p.preco_venda_stars} ⭐`,
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

  const text = `${prod.emoji || "🛍️"} <b>${prod.nome}</b>\n\n${prod.descricao || "Sem descrição disponível."}\n\n<b>Preço:</b> ${prod.preco_venda_stars} ⭐ Telegram Stars (~$${prod.preco_venda_usd.toFixed(2)} USD)\n<b>Entrega:</b> ${entregaTexto}\n<b>Garantia:</b> ${prod.garantia_dias} dias\n${estoqueTexto}`;

  await telegram.sendMessage({
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: `🛒 Comprar Agora (${prod.preco_venda_stars} ⭐)`, callback_data: `buy_${prod.id}` }],
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
    // 1. Cria pedido com preço congelado
    const orderData = await orderService.createOrder({
      telegramId: user.id,
      username: user.username,
      firstName: user.first_name,
      produtoId,
      quantidade: 1,
      metodoPagamento: "telegram_stars",
    });

    // 2. Emite fatura oficial Telegram Stars (sendInvoice com XTR)
    await telegram.sendInvoice({
      chat_id: chatId,
      title: orderData.produto_nome,
      description: `Pedido ${orderData.referencia_unica} - Entrega digital automática`,
      payload: `order_${orderData.pedido_id}`,
      currency: "XTR",
      prices: [
        {
          label: orderData.produto_nome.slice(0, 30),
          amount: orderData.total_stars,
        },
      ],
      start_parameter: `pay_${orderData.referencia_unica}`,
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

    text += `🔹 <b>${p.produto?.nome || "Produto"}</b>\n• Ref: <code>${p.referencia_unica}</code>\n• Status: ${statusIcon}\n• Total: ${p.total_stars} ⭐ Stars\n• Data: ${dataFormatada}\n`;

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
