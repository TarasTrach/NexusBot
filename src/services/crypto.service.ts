import TelegramAPI from "node-telegram-bot-api";
import {
  searchAllP2P,
  P2POrderWithExchange,
  okxP2P,
  binanceP2P,
} from "../utils/crypto/p2pFetchers";
import fs from "fs";
import path from "path";

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

export async function exchangePaypalToUsdtLive(
  chatID: number,
  bot: TelegramAPI,
  intervalSec = 20
) {
  const CONFIG_DIR = path.resolve(__dirname, "../config");
  const RATE_FILE = path.join(CONFIG_DIR, "rate.txt");

  const ensureRateFile = () => {
    if (!fs.existsSync(CONFIG_DIR))
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    if (!fs.existsSync(RATE_FILE)) fs.writeFileSync(RATE_FILE, "0", "utf-8");
  };

  const readRate = (): number => {
    ensureRateFile();
    const raw = fs.readFileSync(RATE_FILE, "utf-8").trim();
    const r = parseFloat(raw.replace(",", "."));
    return isNaN(r) || r <= 0 ? 0 : r;
  };

  const writeRate = (rate: number): void => {
    ensureRateFile();
    fs.writeFileSync(RATE_FILE, rate.toString(), "utf-8");
  };

  const askNumber = (prompt: string, error: string): Promise<number> =>
    new Promise((resolve) => {
      bot.sendMessage(chatID, prompt);
      const handler = (msg: any) => {
        if (msg.chat.id === chatID && msg.text) {
          const v = parseFloat(msg.text.replace(",", ".").trim());
          if (!isNaN(v) && v > 0) {
            bot.removeListener("message", handler);
            resolve(v);
          } else {
            bot.sendMessage(chatID, error);
          }
        }
      };
      bot.on("message", handler);
    });

  const askChoice = (
    prompt: string,
    opts: { text: string; callback_data: string }[]
  ): Promise<string> =>
    new Promise((resolve) => {
      bot.sendMessage(chatID, prompt, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [opts] },
      });
      const handler = async (cb: any) => {
        if (
          cb.from.id === chatID &&
          opts.some((o) => o.callback_data === cb.data)
        ) {
          await bot.answerCallbackQuery(cb.id);
          bot.removeListener("callback_query", handler);
          resolve(cb.data);
        }
      };
      bot.on("callback_query", handler);
    });

  const usdAmount = await askNumber(
    "Введіть суму (USD):",
    "Введіть коректне число:"
  );
  const bank = await askChoice("Оберіть банк:", [
    { text: "ПриватБанк", callback_data: "PrivatBank" },
    { text: "Монобанк", callback_data: "Monobank" },
    { text: "А-Банк", callback_data: "ABank" },
  ]);

  let rate = readRate();
  let rateChanged = false;
  if (rate > 0) {
    const choice = await askChoice(
      `Курс PayPal: *${rate.toFixed(2)}* ₴\nВикористати цей курс?`,
      [
        { text: "OK", callback_data: "RATE_OK" },
        { text: "Змінити", callback_data: "RATE_CHANGE" },
      ]
    );
    if (choice === "RATE_CHANGE") {
      rate = await askNumber(
        "Введіть курс PayPal (₴):",
        "Введіть коректний курс:"
      );
      rateChanged = true;
    }
  } else {
    rate = await askNumber(
      "Введіть курс PayPal (₴):",
      "Введіть коректний курс:"
    );
    rateChanged = true;
  }
  if (rateChanged) writeRate(rate);

  const amountUAH = Math.floor((usdAmount * rate) / 10) * 10;
  const amountUSD = usdAmount.toFixed(2);
  const discountPercent = 5;
  const discountedAmountUSD = (usdAmount * (1 - discountPercent / 100)).toFixed(
    2
  );
  const discountValueUSD = (usdAmount * (discountPercent / 100)).toFixed(2);

  const heading = [
    `Сума USD: ${amountUSD} $  ->  ${discountedAmountUSD}(${discountValueUSD})USDT`,
    `Сума UAH: ${amountUAH} ₴`,
    `Курс PayPal: *${rate.toFixed(2)}* ₴`,
    `Банк: ${bank}`,
  ].join("\n");

  const sent = await bot.sendMessage(chatID, `${heading}\n\nЗавантаження…`, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[{ text: "❌ Stop", callback_data: "STOP_LIVE" }]],
    },
  });
  const messageId = sent.message_id;

  let lastText: string | null = null;
  let lastAlertPrice: number | null = null;

  const update = async () => {
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
      const suitable = orders.filter(
        (o) =>
          (o.minSingleTransAmount <= amountUAH &&
            o.maxSingleTransAmount >= amountUAH) ||
          o.raw?.recentOrderNum > 5
      );

      let newText: string;
      if (!suitable.length) {
        newText = `${heading}\n\nПідходящі ордери не знайдено 😔`;
      } else {
        const top3 = suitable.sort((a, b) => a.price - b.price).slice(0, 3);
        const lines = top3.map((o) => {
          const receivedUSDT =
            amountUAH / o.price - Number(discountedAmountUSD);
          const priceBold = `*${o.price.toFixed(2)}*`;
          const indicator = o.price < rate ? " 🟢" : "";
          return [
            `🏷 ${o.exchange}`,
            `💰 ${priceBold} ₴ | ${receivedUSDT.toFixed(2)} USDT${indicator}`,
            `🔢 ${o.minSingleTransAmount}–${o.maxSingleTransAmount} ₴`,
            `🤝 ${o.nickname ?? "—"}`,
          ].join("\n");
        });
        newText = [heading, ...lines].join("\n\n");
      }

      if (newText !== lastText) {
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
        lastText = newText;
      }

      const cheapest = suitable
        .filter((o) => o.raw?.orderNum > 5)
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
    } catch (err) {}
  };

  await update();
  const id = setInterval(update, intervalSec * 1000);

  bot.once("callback_query", async (cb: any) => {
    if (cb.data === "STOP_LIVE" && cb.message?.message_id === messageId) {
      clearInterval(id);
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatID, message_id: messageId }
      );
      await bot.answerCallbackQuery(cb.id, { text: "Live-оновлення зупинено" });
    }
  });
}
