import { Injectable } from "@nestjs/common";
import axios from "axios";
import TelegramAPI from "node-telegram-bot-api";
import { P2PService } from "../p2p/p2p.service";
import { P2POrderWithExchange } from "../p2p/p2p.types";
import { SettingKey, SettingsService } from "../settings/settings.service";

interface FeeParams {
  rate: number;
  usdAmount: number;
  discountPercent: number;
  orderIndex: number;
}

interface FeeCacheEntry {
  feePercent: number | null;
  lastComputed: number;
  params: FeeParams;
  formattedMessage: string;
}

const FEE_CACHE_TTL_MS = 3 * 60 * 60 * 1000;

@Injectable()
export class FeesService {
  private feeCache: FeeCacheEntry | null = null;

  constructor(
    private readonly p2p: P2PService,
    private readonly settings: SettingsService
  ) {}

  /**
   * Отримує чистий P2P відсоток комісії (без discount_percent)
   * Повертає null якщо не вдалося отримати дані
   */
  async getRawP2PFeePercent(): Promise<number | null> {
    const rate = await this.settings.get(SettingKey.PaypalRate);
    const usdAmount = await this.settings.get(SettingKey.UsdAmount);
    const orderIndex = await this.settings.get(SettingKey.OrderIndex);

    if (rate <= 0) return null;

    const amountUAH = Math.floor((usdAmount * rate) / 10) * 10;

    try {
      const suitable = await this.p2p.searchSuitable(amountUAH);
      const order = this.pickOrder(suitable, orderIndex);
      if (!order) return null;

      // Чистий P2P: скільки USDT отримаємо за amountUAH мінус usdAmount
      const receivedUSDT = amountUAH / order.price;
      const rawFee = receivedUSDT - usdAmount;
      // Від'ємне значення = комісія (ми втрачаємо), позитивне = профіт
      const rawFeePercent = (rawFee / usdAmount) * -100;

      return Number(rawFeePercent.toFixed(2));
    } catch {
      return null;
    }
  }

  /**
   * Повна комісія (включно з discount_percent) для заданих параметрів.
   */
  async computeFullFeePercent(params: FeeParams): Promise<number | null> {
    const { rate, usdAmount, discountPercent, orderIndex } = params;
    if (rate <= 0) return null;

    const amountUAH = Math.floor((usdAmount * rate) / 10) * 10;
    const discountedAmountUSD = usdAmount * (1 - discountPercent / 100);
    const discountValueUSD = usdAmount * (discountPercent / 100);

    try {
      const suitable = await this.p2p.searchSuitable(amountUAH);
      const order = this.pickOrder(suitable, orderIndex);
      if (!order) return null;

      const receivedUSDT = amountUAH / order.price - discountedAmountUSD;
      const amountToPayAdditionally = discountValueUSD - receivedUSDT;
      const fullFee = discountValueUSD + amountToPayAdditionally;
      const fullFeeInPercent = (fullFee / usdAmount) * 100;
      return Number(fullFeeInPercent.toFixed(1));
    } catch {
      return null;
    }
  }

  async calculatePaypalAmountForCrypto(
    bot?: TelegramAPI,
    chatID?: number
  ): Promise<{
    paypalAmount: number;
    expectedUsdt: number;
    fee: number;
    feePercent: number;
    p2pFeePercent: number | null;
  }> {
    const paypalRate = await this.getPaypalRateOrThrow();

    const monobankSendAmount = 1000;
    const monobankPercentFee = 0.01;
    const monobankFlatFeeUsd = 1;
    const bybitRate = 1.0015;
    const monobankTargetUsd = monobankSendAmount * (1 + monobankPercentFee);

    const monobankRate = await this.fetchMonobankUsdRate();

    const paypalUsd = (monobankTargetUsd * monobankRate) / paypalRate;
    const amountToBybit = monobankTargetUsd / (1 + monobankPercentFee);
    const amountAfterFlatFee = amountToBybit - monobankFlatFeeUsd;
    const expectedUsdt = amountAfterFlatFee / bybitRate;
    const feeUsd = paypalUsd - expectedUsdt;
    const feePercent = expectedUsdt > 0 ? (feeUsd / expectedUsdt) * 100 : 0;

    const p2pFeePercent = await this.getRawP2PFeePercent();

    const result = {
      paypalAmount: Number(paypalUsd.toFixed(2)),
      expectedUsdt: Number(expectedUsdt.toFixed(2)),
      fee: Number(feeUsd.toFixed(2)),
      feePercent: Number(feePercent.toFixed(2)),
      p2pFeePercent,
    };

    if (bot && typeof chatID === "number") {
      const p2pInfo =
        result.p2pFeePercent !== null ? `\nP2P fee: ${result.p2pFeePercent.toFixed(2)}%` : "";
      await bot.sendMessage(
        chatID,
        `Переказ з PayPal: ${result.paypalAmount.toFixed(2)} $\nОчікувано на Bybit: ${result.expectedUsdt.toFixed(2)} USDT\nКомісія: ${result.feePercent.toFixed(2)}%${p2pInfo}`
      );
    }

    return result;
  }

  async calculatePaypalAmountForNbuLimit(
    bot?: TelegramAPI,
    chatID?: number
  ): Promise<{ paypalAmount: number; finalUsdAmount: number; fee: number; feePercent: number }> {
    const paypalRate = await this.getPaypalRateOrThrow();

    const nbuLimitUah = 100000;
    const monobankPercentFee = 0.009;

    const monobankRate = await this.fetchMonobankUsdRate();

    const rawUsdTarget = nbuLimitUah / monobankRate;
    // Round down to the nearest hundred to comply with the NBU limit requirement.
    const finalUsd = Math.floor(rawUsdTarget / 100) * 100;
    if (finalUsd <= 0) {
      throw new Error("Неможливо розрахувати суму за поточним курсом Монобанку");
    }

    const usdIncludingFee = finalUsd * (1 + monobankPercentFee);
    const paypalAmountRaw = (usdIncludingFee * monobankRate) / paypalRate + 1;
    const feeUsdRaw = paypalAmountRaw - finalUsd;
    const feePercentRaw = (feeUsdRaw / finalUsd) * 100;

    const result = {
      paypalAmount: Number(paypalAmountRaw.toFixed(2)),
      finalUsdAmount: Number(finalUsd.toFixed(2)),
      fee: Number(feeUsdRaw.toFixed(2)),
      feePercent: Number(feePercentRaw.toFixed(2)),
    };

    if (bot && typeof chatID === "number") {
      await bot.sendMessage(
        chatID,
        `Початкова сума PayPal: ${result.paypalAmount.toFixed(2)} $\nФінальна сума: ${result.finalUsdAmount.toFixed(2)} $\nКомісія: ${result.feePercent.toFixed(2)}% (${result.fee.toFixed(2)} $)`
      );
    }

    return result;
  }

  async getSecondTopFullFeePercentOnce(bot?: TelegramAPI, chatID?: number): Promise<number | null> {
    const rate = await this.settings.get(SettingKey.PaypalRate);
    const usdAmount = await this.settings.get(SettingKey.UsdAmount);
    const discountPercent = await this.settings.get(SettingKey.DiscountPercent);
    const orderIndex = await this.settings.get(SettingKey.OrderIndex);

    const now = Date.now();
    const params: FeeParams = { rate, usdAmount, discountPercent, orderIndex };

    const paramsEqual = (a: FeeParams, b: FeeParams) =>
      a.rate === b.rate &&
      a.usdAmount === b.usdAmount &&
      a.discountPercent === b.discountPercent &&
      a.orderIndex === b.orderIndex;

    if (
      this.feeCache &&
      now - this.feeCache.lastComputed < FEE_CACHE_TTL_MS &&
      paramsEqual(this.feeCache.params, params)
    ) {
      if (bot && chatID != null) {
        try {
          const parseMode = /<b>/i.test(this.feeCache.formattedMessage) ? ("HTML" as const) : undefined;
          await bot.sendMessage(
            chatID,
            this.feeCache.formattedMessage,
            parseMode ? ({ parse_mode: parseMode } as any) : undefined
          );
        } catch {}
      }
      return this.feeCache.feePercent;
    }

    let loadingMsg: { message_id: number } | null = null;
    if (bot && chatID != null) {
      try {
        loadingMsg = await bot.sendMessage(chatID, "Updating fees...");
      } catch {}
    }

    const feePercent = await this.computeFullFeePercent(params);

    const fmt = (n: number) => Number(n.toFixed(1)).toFixed(1);
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const yyyy = today.getFullYear();
    const dateStr = `${dd}.${mm}.${yyyy}`;

    let text: string;
    if (rate <= 0) {
      text = "Rate not set. Update PayPal rate first.";
    } else if (feePercent == null) {
      text = "Error, try again";
    } else {
      const fee = feePercent;
      const paypalRows: Array<[string, string]> = [
        ["$100-200", `${fmt(fee + 1)}%`],
        ["$200-600", `${fmt(fee)}%`],
        ["$600-1000", `${fmt(fee - 0.2)}%`],
        ["$1000+", `${fmt(fee - 0.5)}%`],
      ];
      const payoneerRows: Array<[string, string]> = [
        ["$200-500", `${fmt(4)}%`],
        ["$500-1000", `${fmt(3.4)}%`],
        ["$1000+", `${fmt(3.4 - 0.5)}%`],
      ];
      const allLabels = [...paypalRows, ...payoneerRows].map((r) => r[0]);
      const maxLen = Math.max(...allLabels.map((l) => l.length));
      const formatRow = (label: string, val: string) => label.padEnd(maxLen, " ") + "  = " + val;

      const lines = [
        `<b>Crypto exchange fees on ${dateStr}</b>`,
        "",
        `<b>| PayPal -> USDT |</b>`,
        ...paypalRows.map(([l, v]) => formatRow(l, v)),
        "",
        `<b>| Payoneer -> USDT |</b>`,
        ...payoneerRows.map(([l, v]) => formatRow(l, v)),
      ];
      const mergedBlock = `<pre>${lines.join("\n")}</pre>`;
      text = `${mergedBlock}\n\n<b>Contact: @TarasUpwork</b>`;
    }

    if (bot && chatID != null && loadingMsg) {
      try {
        await bot.editMessageText(text, {
          chat_id: chatID,
          message_id: loadingMsg.message_id,
          parse_mode: /<b>/i.test(text) ? "HTML" : undefined,
        });
      } catch {}
    }

    this.feeCache = {
      feePercent,
      lastComputed: now,
      params,
      formattedMessage: text,
    };
    return feePercent;
  }

  private pickOrder(
    suitable: P2POrderWithExchange[],
    orderIndex: number
  ): P2POrderWithExchange | null {
    if (suitable.length < 2) return null;
    const top10 = [...suitable].sort((a, b) => a.price - b.price).slice(0, 10);
    if (top10.length < 2) return null;

    let idx = Math.floor(orderIndex);
    if (idx < 0) idx = 0;
    if (idx >= top10.length) idx = top10.length - 1;
    return top10[idx];
  }

  private async getPaypalRateOrThrow(): Promise<number> {
    const rate = await this.settings.get(SettingKey.PaypalRate);
    if (!rate || rate <= 0) {
      throw new Error("Курс PayPal не встановлено. Оновіть його командою /paypalrate");
    }
    return rate;
  }

  private async fetchMonobankUsdRate(): Promise<number> {
    const { data } = await axios.get("https://api.monobank.ua/bank/currency");
    const entry = Array.isArray(data)
      ? data.find((item: any) => item.currencyCodeA === 840 && item.currencyCodeB === 980)
      : null;

    if (!entry) {
      throw new Error("Монобанк не повернув курс USD/UAH");
    }

    const monobankRate = entry.rateSell || entry.rateCross || entry.rateBuy;
    if (!monobankRate) {
      throw new Error("У відповіді Монобанку не знайдено курс продажу USD");
    }
    return monobankRate;
  }
}
