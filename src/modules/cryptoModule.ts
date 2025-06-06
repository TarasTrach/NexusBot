import TelegramAPI from "node-telegram-bot-api";
import {
  searchAllP2P,
  P2POrderWithExchange,
  okxP2P,
  binanceP2P,
} from "../utils/crypto/p2pFetchers";

export async function exchangeObnalSchema(chatID: number, bot: TelegramAPI) {
  const query = {
    asset: "USDT",
    fiat: "EUR",
    tradeType: "SELL" as "BUY" | "SELL",
    payTypes: ["Bank Transfer", "Bank", "Bank_Transfer"],
    amount: null,
    rows: 20,
    page: 1,
  } as const;

  const orders = await searchAllP2P(query as any);
  if (!orders.length) {
    await bot.sendMessage(chatID, "Ордери не знайдено 😔");
    return;
  }

  const heading =
    query.tradeType === "SELL"
      ? `🔴 SELL ${query.asset} to ${query.fiat}`
      : `🟢 BUY  ${query.asset} for ${query.fiat}`;

  /* 2. Сортуємо та беремо топ-5 */
  const sorted = [...orders].sort((a, b) =>
    query.tradeType === "SELL" ? b.price - a.price : a.price - b.price
  );
  const top5 = sorted.slice(0, 5);

  const formatOrder = (o: P2POrderWithExchange) =>
    [
      `🏷 ${o.exchange}`,
      `💰 Ціна: ${o.price} ${query.fiat}`,
      `🔢 Ліміт: ${o.minSingleTransAmount} - ${o.maxSingleTransAmount} ${
        query.tradeType == "SELL" ? query.fiat : query.asset
      }`,
      `🤝 Продавець: ${o.nickname ?? "—"}`,
    ].join("\n");

  const message = [
    heading,
    "",
    ...top5.map((o, idx) => `#${idx + 1}  ${formatOrder(o)}\n`),
  ].join("\n");

  await bot.sendMessage(chatID, message);
}

export async function exchangeObnalSchemaLive(
  chatID: number,
  bot: TelegramAPI,
  updateIntervalSec = 30
) {
  const nicknameExceptions = new Set<string>([
    "FatumaHassan9009",
    "double⏩",
    "Fastious",
    "basso💵",
  ]);

  const query = {
    asset: "USDT",
    fiat: "EUR",
    tradeType: "SELL" as "BUY" | "SELL",
    payTypes: ["Bank Transfer", "Bank", "Bank_Transfer"],
    amount: null,
    rows: 20,
    page: 1,
  } as const;

  const formatTop5 = (orders: P2POrderWithExchange[]): string => {
    const heading =
      query.tradeType === "SELL"
        ? `🔴 SELL ${query.asset} to ${query.fiat} (🔃 ${updateIntervalSec} sec interval)`
        : `🟢 BUY  ${query.asset} for ${query.fiat} (🔃 ${updateIntervalSec} sec interval)`;

    const filtered = orders.filter(
      (o) => !nicknameExceptions.has(o.nickname ?? "")
    );

    const sorted = [...filtered].sort((a, b) =>
      query.tradeType === "SELL" ? b.price - a.price : a.price - b.price
    );
    const top5 = sorted.slice(0, 5);

    return [
      heading,
      ...top5.map((o, i) =>
        [
          `#${i + 1}  🏷 ${o.exchange}`,
          `💰 ${o.price} ${query.fiat} ${o.price >= 0.95 ? "🟢" : ""}`,
          `🔢 ${o.minSingleTransAmount} – ${o.maxSingleTransAmount} ${
            query.tradeType === "SELL" ? query.fiat : query.asset
          }`,
          `🤝 ${o.nickname ?? "—"}`,
        ].join("\n")
      ),
    ].join("\n\n");
  };

  const sent = await bot.sendMessage(chatID, "Loading…", {
    reply_markup: {
      inline_keyboard: [[{ text: "❌ Stop", callback_data: "STOP_LIVE" }]],
    },
  });
  const messageId = sent.message_id;
  let lastText: string | null = null;

  const doUpdate = async () => {
    const orders = await searchAllP2P(query as any);
    const text = orders.length ? formatTop5(orders) : "Ордери не знайдено 😔";

    if (text === lastText) return;
    lastText = text;

    try {
      await bot.editMessageText(text, {
        chat_id: chatID,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: "❌ Stop", callback_data: "STOP_LIVE" }]],
        },
      });
    } catch (err: any) {
      if (!/message is not modified/.test(err.message)) {
        console.error("Failed to edit live message:", err);
      }
    }
  };

  await doUpdate();
  const interval = setInterval(doUpdate, updateIntervalSec * 1000);

  bot.once("callback_query", async (cb) => {
    if (cb.data === "STOP_LIVE" && cb.message?.message_id === messageId) {
      clearInterval(interval);
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatID, message_id: messageId }
      );
      await bot.answerCallbackQuery(cb.id, {
        text: "Live updates stopped",
      });
    }
  });
}

export async function testOne(chatID: number, bot: TelegramAPI) {
  const query = {
    asset: "USDT",
    fiat: "EUR",
    tradeType: "SELL",
    payTypes: [],
    amount: 8500,
    rows: 20,
    page: 1,
  } as const;

  const orders = (await okxP2P(query as any)) as Array<{
    price: number;
    quantity: number;
    minSingleTransAmount: number;
    maxSingleTransAmount: number;
    nickname: string;
    payTypes: string[];
  }>;

  const top5 = orders.slice(0, 5);
  if (!top5.length) {
    await bot.sendMessage(chatID, "Ордери не знайдено 😔");
    return;
  }

  const headerHtml =
    query.tradeType === "SELL"
      ? `🔴 <b>SELL ${query.asset} → ${query.fiat}</b>`
      : `🟢 <b>BUY  ${query.asset} ← ${query.fiat}</b>`;

  const blocks = top5.map((o, idx) => {
    const nick = escapeHTML(o.nickname);
    const pay = escapeHTML(o.payTypes.join(", "));
    return [
      `<b>${idx + 1}.</b> 🏷 <code>${nick}</code>`,
      `💰 ${o.price} ${query.fiat}`,
      `🔢 ${o.minSingleTransAmount}–${o.maxSingleTransAmount} ${query.fiat}`,
      `📦 Доступно: ${o.quantity} ${query.asset}`,
      `🤝 Методи: ${pay}`,
    ].join("\n");
  });

  const text = [headerHtml, ...blocks].join("\n\n");
  const chunkSize = 4000;
  for (let i = 0; i < text.length; i += chunkSize) {
    await bot.sendMessage(chatID, text.substring(i, i + chunkSize), {
      parse_mode: "HTML",
    });
  }
}

function escapeHTML(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function exchangePaypalToUsdtSchemaLive(
  chatID: number,
  bot: TelegramAPI,
  updateIntervalSec = 30
) {
  const promptNumber = (
    promptText: string,
    errorText: string
  ): Promise<number> => {
    return new Promise((resolve) => {
      bot.sendMessage(chatID, promptText);
      const onMessage = (msg: any) => {
        if (msg.chat.id === chatID && msg.text) {
          const value = parseFloat(msg.text.replace(",", ".").trim());
          if (!isNaN(value) && value > 0) {
            bot.removeListener("message", onMessage);
            resolve(value);
          } else {
            bot.sendMessage(chatID, errorText);
          }
        }
      };
      bot.on("message", onMessage);
    });
  };

  const promptChoice = (
    promptText: string,
    options: { text: string; callback_data: string }[]
  ): Promise<string> => {
    return new Promise((resolve) => {
      bot.sendMessage(chatID, promptText, {
        reply_markup: {
          inline_keyboard: [options],
        },
      });
      const onCallback = async (cb: any) => {
        if (
          cb.from.id === chatID &&
          options.map((o) => o.callback_data).includes(cb.data)
        ) {
          await bot.answerCallbackQuery(cb.id);
          bot.removeListener("callback_query", onCallback);
          resolve(cb.data);
        }
      };
      bot.on("callback_query", onCallback);
    });
  };

  const usdAmount = await promptNumber(
    "Введіть суму (USD):",
    "Введіть коректне число:"
  );

  const bank = await promptChoice("Оберіть банк:", [
    { text: "ПриватБанк", callback_data: "PrivatBank" },
    { text: "Монобанк", callback_data: "Monobank" },
    { text: "А-Банк", callback_data: "ABank" },
  ]);

  let rate = 0;
  rate = await new Promise((resolve) => {
    const promptRateConfirmation = () => {
      const text = `Курс PayPal: *${rate.toFixed(2)}* ₴\nВикористати цей курс?`;
      bot.sendMessage(chatID, text, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "OK", callback_data: "RATE_OK" },
              { text: "Змінити", callback_data: "RATE_CHANGE" },
            ],
          ],
        },
      });
    };

    promptRateConfirmation();

    const onCallbackRate = async (cb: any) => {
      if (
        cb.from.id === chatID &&
        ["RATE_OK", "RATE_CHANGE"].includes(cb.data)
      ) {
        await bot.answerCallbackQuery(cb.id);
        bot.removeListener("callback_query", onCallbackRate);

        if (cb.data === "RATE_OK") {
          resolve(rate);
        } else {
          const onMessageRate = (msg: any) => {
            if (msg.chat.id === chatID && msg.text) {
              const value = parseFloat(msg.text.replace(",", ".").trim());
              if (!isNaN(value) && value > 0) {
                bot.removeListener("message", onMessageRate);
                resolve(value);
              } else {
                bot.sendMessage(chatID, "Введіть коректний курс:");
              }
            }
          };
          bot.sendMessage(chatID, "Введіть курс:");
          bot.on("message", onMessageRate);
        }
      }
    };

    bot.on("callback_query", onCallbackRate);
  });

  const amountUAH = Math.floor((usdAmount * rate) / 10) * 10;
  const amountUSD = usdAmount.toFixed(2);
  const discountPercent = 5;
  const discountedAmountUSD = (usdAmount * (1 - discountPercent / 100)).toFixed(2);
  const discountValueUSD = (usdAmount * (discountPercent / 100)).toFixed(2);

  const heading = [
    `Сума USD: ${amountUSD} $  ->  ${discountedAmountUSD}(${discountValueUSD})USDT`,
    `Сума UAH: ${amountUAH} ₴`,
    `Курс PayPal: *${rate.toFixed(2)}* ₴`,
    `Банк: ${bank}`,
  ].join("\n");

  const sentMessage = await bot.sendMessage(
    chatID,
    `${heading}\n\nЗавантаження…`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Stop", callback_data: "STOP_LIVE" }]],
      },
    }
  );
  const messageId = sentMessage.message_id;

  let lastText: string | null = null;
  let lastAlertPrice: number | null = null;

  const formatTop5 = (orders: P2POrderWithExchange[]): string => {
    const suitable = orders.filter(
      (o) =>
        o.minSingleTransAmount <= amountUAH &&
        o.maxSingleTransAmount >= amountUAH
    );
    if (!suitable.length) {
      return `${heading}\n\nПідходящі ордери не знайдено 😔`;
    }

    const top5 = [...suitable].sort((a, b) => a.price - b.price).slice(0, 5);

    const orderLines = top5.map((o) => {
      const receivedUSDT = amountUAH / o.price - Number(discountedAmountUSD);
      const priceBold = `*${o.price.toFixed(2)}* ₴      | ${receivedUSDT.toFixed(2)} USDT`;
      const indicator = o.price < rate ? " 🟢" : "";
      const range = `${o.minSingleTransAmount}–${o.maxSingleTransAmount} ₴`;
      const nick = o.nickname ?? "—";

      return [
        `🏷 ${o.exchange}`,
        `💰 ${priceBold}${indicator}`,
        `🔢 ${range}`,
        `🤝 ${nick}`,
      ].join("\n");
    });

    return [heading, ...orderLines].join("\n\n");
  };

  const doUpdate = async () => {
    try {
      const orders = await searchAllP2P({
        asset: "USDT",
        fiat: "UAH",
        tradeType: "BUY",
        amount: amountUAH,
        payTypes: [bank],
        rows: 20,
        page: 1,
      });

      const newText = formatTop5(orders);

      if (newText !== lastText) {
        lastText = newText;
        await bot.editMessageText(newText, {
          chat_id: chatID,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "❌ Stop", callback_data: "STOP_LIVE" }],
            ],
          },
        });
      }

      const cheapest = orders
        .filter(
          (o) =>
            o.minSingleTransAmount <= amountUAH &&
            o.maxSingleTransAmount >= amountUAH
        )
        .sort((a, b) => a.price - b.price)[0];

      if (
        cheapest &&
        cheapest.price < rate &&
        lastAlertPrice !== cheapest.price
      ) {
        await bot.sendMessage(
          chatID,
          `Знайдено ${cheapest.price.toFixed(2)} ₴ < ${rate.toFixed(2)} ₴`
        );
        lastAlertPrice = cheapest.price;
      }
    } catch {
    }
  };

  await doUpdate();
  const intervalId = setInterval(doUpdate, updateIntervalSec * 1000);

  bot.once("callback_query", async (cb: any) => {
    if (cb.data === "STOP_LIVE" && cb.message?.message_id === messageId) {
      clearInterval(intervalId);

      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatID, message_id: messageId }
      );

      await bot.answerCallbackQuery(cb.id, {
        text: "Live-оновлення зупинено",
      });
    }
  });
}
