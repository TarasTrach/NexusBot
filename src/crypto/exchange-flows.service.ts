import { Injectable } from "@nestjs/common";
import TelegramAPI from "node-telegram-bot-api";
import { P2PService } from "../p2p/p2p.service";
import { SettingKey, SettingsService } from "../settings/settings.service";
import { FeesService } from "./fees.service";

@Injectable()
export class ExchangeFlowsService {
  private readonly activeSettingsSessions = new Map<number, { onCb: any; onMsg: any }>();

  constructor(
    private readonly p2p: P2PService,
    private readonly settings: SettingsService,
    private readonly fees: FeesService
  ) {}

  async exchangePaypalToUsdtLive(bot: TelegramAPI, chatID: number, intervalSec = 10) {
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

    const askChoice = (prompt: string, opts: { text: string; callback_data: string }[]): Promise<string> =>
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

    let rate = await this.settings.get(SettingKey.PaypalRate);
    let rateChanged = false;

    if (rate > 0) {
      const choice = await askChoice(`Курс PayPal: ${rate.toFixed(2)} ₴\nВикористати цей курс?`, [
        { text: "OK", callback_data: "RATE_OK" },
        { text: "Змінити", callback_data: "RATE_CHANGE" },
      ]);

      if (choice === "RATE_CHANGE") {
        rate = await askNumber("Введіть курс PayPal (₴):", "Введіть коректний курс:");
        rateChanged = true;
      }
    } else {
      rate = await askNumber("Введіть курс PayPal (₴):", "Введіть коректний курс:");
      rateChanged = true;
    }

    if (rateChanged) await this.settings.set(SettingKey.PaypalRate, rate);

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
        const suitable = await this.p2p.searchSuitable(amountUAH, [bank]);

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

        const cheapest = suitable.filter((o) => o.raw?.orderNum > 5).sort((a, b) => a.price - b.price)[0];

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

  async updatePaypalRate(bot: TelegramAPI, chatID: number): Promise<number | null> {
    try {
      let currentRate = await this.settings.get(SettingKey.PaypalRate);
      const callbackId = "PAYPAL_RATE_OK";

      const introText =
        currentRate > 0
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
          await this.settings.set(SettingKey.PaypalRate, v);
          await bot.sendMessage(
            chatID,
            old > 0 ? `Курс оновлено: ${old.toFixed(2)} ₴ → ${v.toFixed(2)} ₴` : `Курс збережено: ${v.toFixed(2)} ₴`
          );
          try {
            await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatID, message_id: sent.message_id });
          } catch {}
          finish(v);
        };

        const onCallback = async (cb: any) => {
          if (cb.from?.id !== chatID || cb.data !== callbackId) return;
          try {
            await bot.answerCallbackQuery(cb.id);
          } catch {}
          await bot.sendMessage(
            chatID,
            currentRate > 0 ? `Курс залишено без змін: ${currentRate.toFixed(2)} ₴` : `Операцію скасовано.`
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

  async updateDiscountAndUsd(
    bot: TelegramAPI,
    chatID: number
  ): Promise<{ discountPercent: number; usdAmount: number; orderIndex: number } | null> {
    const prev = this.activeSettingsSessions.get(chatID);
    if (prev) {
      bot.removeListener("callback_query", prev.onCb);
      bot.removeListener("message", prev.onMsg);
      this.activeSettingsSessions.delete(chatID);
    }

    try {
      let discountPercent = await this.settings.get(SettingKey.DiscountPercent);
      let usdAmount = await this.settings.get(SettingKey.UsdAmount);
      let orderIndex = await this.settings.get(SettingKey.OrderIndex);
      let paypalRate = await this.settings.get(SettingKey.PaypalRate);

      let feePercent = await this.fees.computeFullFeePercent({
        rate: paypalRate,
        usdAmount,
        discountPercent,
        orderIndex,
      });

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

      const renderText = () =>
        `Поточні значення:\n` +
        `Мій відсоток: ${discountPercent}%\n` +
        `Сума usd для ордерів: ${usdAmount}\n` +
        `Порядковий номер ордеру: ${Math.floor(orderIndex)}\n` +
        `Fee (%): ${feePercent != null ? feePercent.toFixed(1) : "—"}\n\n` +
        `Натисніть кнопку щоб змінити або OK щоб зберегти.`;

      const sent = await bot.sendMessage(chatID, renderText(), { reply_markup: baseKeyboard() });

      let mode: null | "discount" | "usd" | "order" = null;

      return await new Promise((resolve) => {
        const cleanup = () => {
          bot.removeListener("callback_query", onCb as any);
          bot.removeListener("message", onMsg as any);
          this.activeSettingsSessions.delete(chatID);
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
          try {
            await bot.answerCallbackQuery(cb.id);
          } catch {}

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
            await bot.sendMessage(
              chatID,
              `Збережено:\n discount_percent: ${discountPercent}\n usd_amount: ${usdAmount}\n order_index: ${Math.floor(orderIndex)}`
            );
            finish({ discountPercent, usdAmount, orderIndex: Math.floor(orderIndex) });
            return;
          }
        };

        const onMsg = async (msg: any) => {
          if (msg.chat?.id !== chatID || !msg.text) return;
          if (!mode) return;
          if (msg.text.startsWith("/")) return;
          const v = parseFloat(msg.text.replace(",", ".").trim());
          if (isNaN(v) || v <= 0) {
            await bot.sendMessage(chatID, "Невірне число, спробуйте ще раз.");
            return;
          }
          if (mode === "discount") {
            const old = discountPercent;
            discountPercent = v;
            await this.settings.set(SettingKey.DiscountPercent, discountPercent);
            await bot.sendMessage(chatID, `discount_percent оновлено: ${old} → ${discountPercent}`);
          } else if (mode === "usd") {
            const old = usdAmount;
            usdAmount = v;
            await this.settings.set(SettingKey.UsdAmount, usdAmount);
            await bot.sendMessage(chatID, `usd_amount оновлено: ${old} → ${usdAmount}`);
          } else if (mode === "order") {
            const intVal = Math.floor(v);
            if (intVal < 0) {
              await bot.sendMessage(chatID, "order_index не може бути < 0");
              return;
            }
            const old = Math.floor(orderIndex);
            orderIndex = intVal;
            await this.settings.set(SettingKey.OrderIndex, orderIndex);
            await bot.sendMessage(chatID, `order_index оновлено: ${old} → ${orderIndex}`);
          }
          paypalRate = await this.settings.get(SettingKey.PaypalRate);
          feePercent = await this.fees.computeFullFeePercent({
            rate: paypalRate,
            usdAmount,
            discountPercent,
            orderIndex,
          });
          mode = null;
          try {
            await bot.editMessageText(renderText(), {
              chat_id: chatID,
              message_id: sent.message_id,
              reply_markup: baseKeyboard(),
            });
          } catch {}
        };

        this.activeSettingsSessions.set(chatID, { onCb, onMsg });
        bot.on("callback_query", onCb as any);
        bot.on("message", onMsg as any);
      });
    } catch {
      await bot.sendMessage(chatID, "Сталася помилка під час оновлення значень.");
      return null;
    }
  }
}
