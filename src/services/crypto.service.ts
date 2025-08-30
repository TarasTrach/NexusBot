import TelegramAPI from "node-telegram-bot-api";
import {
  searchAllP2P,
  P2POrderWithExchange,
  okxP2P,
  binanceP2P,
} from "../utils/crypto/p2pFetchers";
import fs from "fs";
import path from "path";

interface FeeCacheEntry {
  feePercent: number | null;
  lastComputed: number;
  params: { rate: number; usdAmount: number; discountPercent: number; orderIndex: number };
  formattedMessage: string;
}
let _secondTopFullFeeCache: FeeCacheEntry | null = null;

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
  intervalSec = 10
) {
  const CONFIG_DIR = path.resolve(__dirname, "../config");
  const RATE_FILE = path.join(CONFIG_DIR, "rate.txt");

  /* ──────────────── helpers ──────────────── */

  const ensureRateFile = () => {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
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
      bot.sendMessage(chatID, prompt, { reply_markup: { inline_keyboard: [opts] } });
      const handler = async (cb: any) => {
        if (cb.from.id === chatID && opts.some((o) => o.callback_data === cb.data)) {
          await bot.answerCallbackQuery(cb.id);
          bot.removeListener("callback_query", handler);
          resolve(cb.data);
        }
      };
      bot.on("callback_query", handler);
    });

  /* ──────────────── input ──────────────── */

  const usdAmount = await askNumber("Введіть суму (USD):", "Введіть коректне число:");
  const bank = await askChoice("Оберіть банк:", [
    { text: "ПриватБанк", callback_data: "PrivatBank" },
    { text: "Монобанк", callback_data: "Monobank" },
    { text: "А-Банк", callback_data: "ABank" },
  ]);

  /* ──────────────── rate ──────────────── */

  let rate = readRate();
  let rateChanged = false;

  if (rate > 0) {
    const choice = await askChoice(
      `Курс PayPal: ${rate.toFixed(2)} ₴\nВикористати цей курс?`,
      [
        { text: "OK", callback_data: "RATE_OK" },
        { text: "Змінити", callback_data: "RATE_CHANGE" },
      ]
    );

    if (choice === "RATE_CHANGE") {
      rate = await askNumber("Введіть курс PayPal (₴):", "Введіть коректний курс:");
      rateChanged = true;
    }
  } else {
    rate = await askNumber("Введіть курс PayPal (₴):", "Введіть коректний курс:");
    rateChanged = true;
  }

  if (rateChanged) writeRate(rate);

  /* ──────────────── calculations ──────────────── */

  const amountUAH = Math.floor((usdAmount * rate) / 10) * 10;
  const amountUSD = usdAmount.toFixed(2);
  const discountPercent = 4;
  const discountedAmountUSD = (usdAmount * (1 - discountPercent / 100)).toFixed(2);
  const discountValueUSD = (usdAmount * (discountPercent / 100)).toFixed(2);

  const heading = [
    `Сума USD: ${amountUSD} $ -> ${discountedAmountUSD} (${discountValueUSD}) USDT(${discountPercent}%)`,
    `Сума UAH: ${amountUAH} ₴`,
    `Курс PayPal: ${rate.toFixed(2)} ₴`,
    `Банк: ${bank}`,
  ].join("\n");

  /* ──────────────── live message ──────────────── */

  const sent = await bot.sendMessage(chatID, `${heading}\n\nЗавантаження…`, {
    reply_markup: { inline_keyboard: [[{ text: "❌ Stop", callback_data: "STOP_LIVE" }]] },
  });
  const messageId = sent.message_id;

  let lastText: string | null = null;
  let lastAlertPrice: number | null = null;

  /* ──────────────── updater ──────────────── */

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
          (o.minSingleTransAmount <= amountUAH && o.maxSingleTransAmount >= amountUAH) ||
          (o.recentOrderNum ?? 0) > 3
      );

      let newText: string;

      if (!suitable.length) {
        newText = `${heading}\n\nПідходящі ордери не знайдено 😔`;
      } else {
        const top3 = suitable.sort((a, b) => a.price - b.price).slice(0, 3);

        const lines = top3.map((o) => {
          const receivedUSDT = amountUAH / o.price - Number(discountedAmountUSD);
          const amountToPayAdditionally = Number(discountValueUSD) - receivedUSDT;
          const fullFee = Number(discountValueUSD) + amountToPayAdditionally;
          const amountToReceive = Number(amountUSD) - fullFee;
          const fullFeeInPercent = (fullFee / Number(amountUSD)) * 100;
          const priceText = o.price.toFixed(2);
          const indicator = o.price < rate ? " 🟢" : "";

          return [
            `🏷 ${o.exchange}`,
            `💰 ${priceText} ₴ | ${amountToReceive.toFixed(2)} USDT${indicator}   ${fullFeeInPercent.toFixed(1)}%`,
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
          reply_markup: { inline_keyboard: [[{ text: "❌ Stop", callback_data: "STOP_LIVE" }]] },
        });
        lastText = newText;
      }

      const cheapest = suitable
        .filter((o) => o.raw?.orderNum > 5)
        .sort((a, b) => a.price - b.price)[0];

      if (cheapest && cheapest.price < rate && lastAlertPrice !== cheapest.price) {
        await bot.sendMessage(chatID, `Знайдено ${cheapest.price.toFixed(2)} ₴ < ${rate.toFixed(2)} ₴`);
        lastAlertPrice = cheapest.price;
      }
    } catch {
      /* ignore errors, continue updating */
    }
  };

  await update();
  const id = setInterval(update, intervalSec * 1000);

  /* ──────────────── stop handler ──────────────── */

  bot.once("callback_query", async (cb: any) => {
    if (cb.data === "STOP_LIVE" && cb.message?.message_id === messageId) {
      clearInterval(id);
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatID, message_id: messageId });
      await bot.answerCallbackQuery(cb.id, { text: "Live-оновлення зупинено" });
    }
  });
}

export async function getSecondTopFullFeePercentOnce(bot?: TelegramAPI, chatID?: number): Promise<number | null> {
  const CONFIG_DIR = path.resolve(__dirname, "../config");
  const RATE_FILE = path.join(CONFIG_DIR, "rate.txt");
  const USD_FILE = path.join(CONFIG_DIR, "usd_amount.txt");
  const DISCOUNT_FILE = path.join(CONFIG_DIR, "discount_percent.txt");
  const ORDER_INDEX_FILE = path.join(CONFIG_DIR, "order_index.txt");

  const ensureFile = (file: string, def: string) => {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, def, "utf-8");
  };
  const readNumber = (file: string, def: number): number => {
    ensureFile(file, String(def));
    const raw = fs.readFileSync(file, "utf-8").trim();
    const n = parseFloat(raw.replace(",", "."));
    return isNaN(n) || n <= 0 ? def : n;
  };

  const rate = readNumber(RATE_FILE, 0);
  const usdAmount = readNumber(USD_FILE, 300);
  const discountPercent = readNumber(DISCOUNT_FILE, 4);
  const orderIndex = readNumber(ORDER_INDEX_FILE, 1);

  const CACHE_TTL_MS = 3 * 60 * 60 * 1000;
  const now = Date.now();
  const params = { rate, usdAmount, discountPercent, orderIndex };

  const paramsEqual = (a: FeeCacheEntry["params"], b: FeeCacheEntry["params"]) =>
    a.rate === b.rate && a.usdAmount === b.usdAmount && a.discountPercent === b.discountPercent && a.orderIndex === b.orderIndex;

  if (_secondTopFullFeeCache && now - _secondTopFullFeeCache.lastComputed < CACHE_TTL_MS && paramsEqual(_secondTopFullFeeCache.params, params)) {
    if (bot && chatID != null) {
      try {
        await bot.sendMessage(chatID, _secondTopFullFeeCache.formattedMessage, /<pre>/.test(_secondTopFullFeeCache.formattedMessage) ? { parse_mode: "HTML" } as any : undefined);
      } catch {}
    }
    return _secondTopFullFeeCache.feePercent;
  }

  let loadingMsg: { message_id: number } | null = null;
  if (bot && chatID != null) {
    try { loadingMsg = await bot.sendMessage(chatID, "Updating fees..."); } catch {}
  }

  const amountUAH = rate > 0 ? Math.floor((usdAmount * rate) / 10) * 10 : 0;
  const amountUSD = usdAmount;
  const discountedAmountUSD = usdAmount * (1 - discountPercent / 100);
  const discountValueUSD = usdAmount * (discountPercent / 100);

  const computeFee = async (): Promise<number | null> => {
    if (rate <= 0) return null;
    try {
      const orders = await searchAllP2P({
        asset: "USDT",
        fiat: "UAH",
        tradeType: "BUY",
        amount: amountUAH,
        payTypes: ["Monobank"],
        rows: 20,
        page: 1,
      });
      const suitable = orders.filter(
        (o: any) =>
          (o.minSingleTransAmount <= amountUAH && o.maxSingleTransAmount >= amountUAH) ||
          (o.recentOrderNum ?? 0) > 3
      );
      if (suitable.length < 2) return null;
      const top10 = [...suitable].sort((a: any, b: any) => a.price - b.price).slice(0, 10);
      if (top10.length < 2) return null;
      let idx = Math.floor(orderIndex);
      if (idx < 0) idx = 0;
      if (idx >= top10.length) idx = top10.length - 1;
      const o = top10[idx];
      const receivedUSDT = amountUAH / o.price - discountedAmountUSD;
      const amountToPayAdditionally = discountValueUSD - receivedUSDT;
      const fullFee = discountValueUSD + amountToPayAdditionally;
      const fullFeeInPercent = (fullFee / amountUSD) * 100;
      return Number(fullFeeInPercent.toFixed(1));
    } catch {
      return null;
    }
  };

  const feePercent = await computeFee();

  const fmt = (n: number) => Number(n.toFixed(1)).toFixed(1);
  const row = (label: string, val: string) => `${label.padEnd(12)}= ${val}`;
  let text: string;
  if (rate <= 0) {
    text = "Rate not set. Update PayPal rate first.";
  } else if (feePercent == null) {
    text = `<pre>Error, try again</pre>`;
  } else {
    const fee = feePercent;
    const block = [
      "| PayPal -> USDT |",
      row("$100-200", `${fmt(fee + 1)}%`),
      row("$200-600", `${fmt(fee)}%`),
      row("$600-1000", `${fmt(fee - 0.2)}%`),
      row("$1000+", `${fmt(fee - 0.5)}%`),
      "",
      "| Payoneer -> USDT |",
      row("$200-500", `${fmt(3.4)}%`),
      row("$500-1000", `${fmt(3.4 - 0.6)}%`),
      row("$1000+", `${fmt(3.4 - 1.1)}%`),
    ].join("\n");
    text = `<pre>${block}</pre>`;
  }

  if (bot && chatID != null && loadingMsg) {
    try {
      await bot.editMessageText(text, { chat_id: chatID, message_id: loadingMsg.message_id, parse_mode: /<pre>/.test(text) ? "HTML" : undefined });
    } catch {}
  }

  _secondTopFullFeeCache = {
    feePercent,
    lastComputed: now,
    params,
    formattedMessage: text,
  };

  return feePercent;
}

export async function updatePaypalRate(
  bot: TelegramAPI,
  chatID: number
): Promise<number | null> {
  const CONFIG_DIR = path.resolve(__dirname, "../config");
  const RATE_FILE  = path.join(CONFIG_DIR, "rate.txt");

  const ensureRateFile = () => {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    if (!fs.existsSync(RATE_FILE)) fs.writeFileSync(RATE_FILE, "0", "utf-8");
  };
  const readRate = (): number => {
    ensureRateFile();
    const raw = fs.readFileSync(RATE_FILE, "utf-8").trim();
    const r = parseFloat(raw.replace(",", "."));
    return isNaN(r) || r <= 0 ? 0 : r;
  };
  const writeRate = (rate: number) => {
    ensureRateFile();
    fs.writeFileSync(RATE_FILE, rate.toString(), "utf-8");
  };

  try {
    let currentRate = readRate();
    const callbackId = "PAYPAL_RATE_OK";

    const introText = currentRate > 0
      ? `Поточний курс: ${currentRate.toFixed(2)} ₴\nВведіть новий курс або натисніть OK щоб залишити без змін.`
      : `Курс ще не встановлено. Введіть новий курс (число) або натисніть OK щоб скасувати.`;

    const sent = await bot.sendMessage(chatID, introText, {
      reply_markup: { inline_keyboard: [[{ text: "OK", callback_data: callbackId }]] },
    });

    return await new Promise<number | null>((resolve) => {
      const cleanup = () => {
        bot.removeListener("message", onMessage as any);
        bot.removeListener("callback_query", onCallback as any);
      };

      const finish = (value: number | null) => {
        cleanup();
        resolve(value);
      };

      const onMessage = async (msg: any) => {
        if (msg.chat?.id !== chatID || !msg.text) return;
        const txt = msg.text.trim();
        const v = parseFloat(txt.replace(",", "."));
        if (isNaN(v) || v <= 0) {
          await bot.sendMessage(chatID, "Введіть коректний курс (додатнє число):");
          return;
        }
        const old = currentRate;
        currentRate = v;
        writeRate(v);
        await bot.sendMessage(
          chatID,
          old > 0
            ? `Курс оновлено: ${old.toFixed(2)} ₴ → ${v.toFixed(2)} ₴`
            : `Курс збережено: ${v.toFixed(2)} ₴`
        );
        try {
          await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatID, message_id: sent.message_id });
        } catch {}
        finish(v);
      };

      const onCallback = async (cb: any) => {
        if (cb.from?.id !== chatID || cb.data !== callbackId) return;
        try { await bot.answerCallbackQuery(cb.id); } catch {}
        await bot.sendMessage(
          chatID,
          currentRate > 0
            ? `Курс залишено без змін: ${currentRate.toFixed(2)} ₴`
            : `Операцію скасовано.`
        );
        try {
          await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatID, message_id: sent.message_id });
        } catch {}
        finish(currentRate || null);
      };

      bot.on("message", onMessage as any);
      bot.on("callback_query", onCallback as any);
    });
  } catch {
    await bot.sendMessage(chatID, "Сталася помилка під час оновлення курсу.");
    return null;
  }
}

const _activeUpdateDiscountSessions = new Map<number, { onCb: any; onMsg: any }>();

export async function updateDiscountAndUsd(bot: TelegramAPI, chatID: number): Promise<{ discountPercent: number; usdAmount: number; orderIndex: number } | null> {
  const prev = _activeUpdateDiscountSessions.get(chatID);
  if (prev) {
    bot.removeListener("callback_query", prev.onCb);
    bot.removeListener("message", prev.onMsg);
    _activeUpdateDiscountSessions.delete(chatID);
  }

  const CONFIG_DIR = path.resolve(__dirname, "../config");
  const USD_FILE = path.join(CONFIG_DIR, "usd_amount.txt");
  const DISCOUNT_FILE = path.join(CONFIG_DIR, "discount_percent.txt");
  const ORDER_INDEX_FILE = path.join(CONFIG_DIR, "order_index.txt");
  const RATE_FILE = path.join(CONFIG_DIR, "rate.txt");

  const ensureFile = (file: string, def: string) => {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, def, "utf-8");
  };
  const readNumber = (file: string, def: number): number => {
    ensureFile(file, String(def));
    const raw = fs.readFileSync(file, "utf-8").trim();
    const n = parseFloat(raw.replace(",", "."));
    return isNaN(n) || n <= 0 ? def : n;
  };
  const writeNumber = (file: string, val: number) => {
    ensureFile(file, "0");
    fs.writeFileSync(file, val.toString(), "utf-8");
  };

  try {
    let discountPercent = readNumber(DISCOUNT_FILE, 4);
    let usdAmount = readNumber(USD_FILE, 300);
    let orderIndex = readNumber(ORDER_INDEX_FILE, 1);
    let paypalRate = readNumber(RATE_FILE, 0);

    const computeCryptoMetrics = async () => {
      if (paypalRate <= 0) return { feePercent: null as number | null, orderPrice: null as number | null };
      try {
        const amountUAH = Math.floor((usdAmount * paypalRate) / 10) * 10;
        const discountedAmountUSD = usdAmount * (1 - discountPercent / 100);
        const discountValueUSD = usdAmount * (discountPercent / 100);
        const orders = await searchAllP2P({
          asset: "USDT",
          fiat: "UAH",
          tradeType: "BUY",
          amount: amountUAH,
          payTypes: ["Monobank"],
          rows: 20,
          page: 1,
        });
        const suitable = orders.filter(
          (o: any) =>
            (o.minSingleTransAmount <= amountUAH && o.maxSingleTransAmount >= amountUAH) ||
            (o.recentOrderNum ?? 0) > 3
        );
        if (!suitable.length) return { feePercent: null, orderPrice: null };
        const top10 = [...suitable].sort((a: any, b: any) => a.price - b.price).slice(0, 10);
        if (top10.length < 2) return { feePercent: null, orderPrice: null };
        let idx = Math.floor(orderIndex);
        if (idx < 0) idx = 0;
        if (idx >= top10.length) idx = top10.length - 1;
        const o = top10[idx];
        const receivedUSDT = amountUAH / o.price - discountedAmountUSD;
        const amountToPayAdditionally = discountValueUSD - receivedUSDT;
        const fullFee = discountValueUSD + amountToPayAdditionally;
        const fullFeeInPercent = (fullFee / usdAmount) * 100;
        return { feePercent: Number(fullFeeInPercent.toFixed(1)), orderPrice: o.price };
      } catch {
        return { feePercent: null, orderPrice: null };
      }
    };

    let metrics = await computeCryptoMetrics();

    const baseKeyboard = () => ({
      inline_keyboard: [
        [
          { text: "discount_percent", callback_data: "CFG_EDIT_DISCOUNT" },
          { text: "usd_amount", callback_data: "CFG_EDIT_USD" },
          { text: "order_index", callback_data: "CFG_EDIT_ORDER_INDEX" },
        ],
        [{ text: "OK", callback_data: "CFG_OK" }],
      ],
    });

    const renderText = () => `Поточні значення:\n` +
      `Мій відсоток: ${discountPercent}%\n` +
      `Сума usd для ордерів: ${usdAmount}\n` +
      `Порядковий номер ордеру: ${Math.floor(orderIndex)}\n` +
      `Fee (%): ${metrics.feePercent != null ? metrics.feePercent.toFixed(1) : '—'}\n\n` +
      `Натисніть кнопку щоб змінити або OK щоб зберегти.`;

    const sent = await bot.sendMessage(chatID, renderText(), { reply_markup: baseKeyboard() });

    let mode: null | "discount" | "usd" | "order" = null;

    return await new Promise(resolve => {
      const cleanup = () => {
        bot.removeListener("callback_query", onCb as any);
        bot.removeListener("message", onMsg as any);
        _activeUpdateDiscountSessions.delete(chatID);
      };

      const finish = (val: { discountPercent: number; usdAmount: number; orderIndex: number } | null) => {
        cleanup();
        resolve(val);
      };

      const askPrompt = async () => {
        if (mode === "discount") {
          await bot.sendMessage(chatID, "Введіть новий discount_percent (число > 0):");
        } else if (mode === "usd") {
          await bot.sendMessage(chatID, "Введіть новий usd_amount (число > 0):");
        } else if (mode === "order") {
          await bot.sendMessage(chatID, "Введіть новий order_index (ціле число >= 0):");
        }
      };

      const onCb = async (cb: any) => {
        if (cb.from?.id !== chatID) return;
        const data = cb.data;
        if (!data) return;
        try { await bot.answerCallbackQuery(cb.id); } catch {}

        if (data === "CFG_EDIT_DISCOUNT") {
          mode = "discount";
          await askPrompt();
          return;
        }
        if (data === "CFG_EDIT_USD") {
          mode = "usd";
            await askPrompt();
          return;
        }
        if (data === "CFG_EDIT_ORDER_INDEX") {
          mode = "order";
          await askPrompt();
          return;
        }
        if (data === "CFG_OK") {
          try {
            await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatID, message_id: sent.message_id });
          } catch {}
          await bot.sendMessage(chatID, `Збережено:\n discount_percent: ${discountPercent}\n usd_amount: ${usdAmount}\n order_index: ${Math.floor(orderIndex)}`);
          finish({ discountPercent, usdAmount, orderIndex: Math.floor(orderIndex) });
          return;
        }
      };

      const onMsg = async (msg: any) => {
        if (msg.chat?.id !== chatID || !msg.text) return;
        if (!mode) return;
        if (msg.text.startsWith('/')) return;
        const v = parseFloat(msg.text.replace(",", ".").trim());
        if (isNaN(v) || v <= 0) {
          await bot.sendMessage(chatID, "Невірне число, спробуйте ще раз.");
          return;
        }
        if (mode === "discount") {
          const old = discountPercent;
          discountPercent = v;
          writeNumber(DISCOUNT_FILE, discountPercent);
          await bot.sendMessage(chatID, `discount_percent оновлено: ${old} → ${discountPercent}`);
        } else if (mode === "usd") {
          const old = usdAmount;
          usdAmount = v;
          writeNumber(USD_FILE, usdAmount);
          await bot.sendMessage(chatID, `usd_amount оновлено: ${old} → ${usdAmount}`);
        } else if (mode === "order") {
          const intVal = Math.floor(v);
          if (intVal < 0) {
            await bot.sendMessage(chatID, "order_index не може бути < 0");
            return;
          }
          const old = Math.floor(orderIndex);
          orderIndex = intVal;
          writeNumber(ORDER_INDEX_FILE, orderIndex);
          await bot.sendMessage(chatID, `order_index оновлено: ${old} → ${orderIndex}`);
        }
        paypalRate = readNumber(RATE_FILE, 0);
        metrics = await computeCryptoMetrics();
        mode = null;
        try {
          await bot.editMessageText(renderText(), { chat_id: chatID, message_id: sent.message_id, reply_markup: baseKeyboard() });
        } catch {}
      };

      _activeUpdateDiscountSessions.set(chatID, { onCb, onMsg });
      bot.on("callback_query", onCb as any);
      bot.on("message", onMsg as any);
    });
  } catch {
    await bot.sendMessage(chatID, "Сталася помилка під час оновлення значень.");
    return null;
  }
}