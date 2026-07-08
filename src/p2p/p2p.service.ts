import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { P2POrder, P2POrderWithExchange, P2PQuery } from "./p2p.types";

@Injectable()
export class P2PService {
  private readonly logger = new Logger(P2PService.name);

  /**
   * BUY USDT за UAH: ордери, що покривають задану суму або мають активні угоди.
   */
  async searchSuitable(
    amountUAH: number,
    payTypes: string[] = ["Monobank"]
  ): Promise<P2POrderWithExchange[]> {
    const orders = await this.searchAll({
      asset: "USDT",
      fiat: "UAH",
      tradeType: "BUY",
      amount: amountUAH,
      payTypes,
      rows: 20,
      page: 1,
    });
    return orders.filter(
      (o) =>
        (o.minSingleTransAmount <= amountUAH && o.maxSingleTransAmount >= amountUAH) ||
        (o.recentOrderNum ?? 0) > 3
    );
  }

  async searchAll(q: P2PQuery): Promise<P2POrderWithExchange[]> {
    const [binance, okx, bybit] = await Promise.all([
      this.binance(q),
      this.okx(q),
      this.bybit(q),
    ]);

    const tag = (arr: P2POrder[], exchange: P2POrderWithExchange["exchange"]) =>
      arr.map((o) => ({ ...o, exchange }));

    return [...tag(binance, "Binance"), ...tag(okx, "OKX"), ...tag(bybit, "Bybit")];
  }

  async binance(q: P2PQuery): Promise<P2POrder[]> {
    try {
      const body = {
        page: q.page || 1,
        rows: q.rows || 20,
        payTypes: q.payTypes,
        asset: q.asset,
        fiat: q.fiat,
        tradeType: q.tradeType,
        transAmount: q.amount ? q.amount.toString() : undefined,
        publisherType: null,
      };

      const response = await axios.post(
        "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search",
        body,
        { headers: { "Content-Type": "application/json" } }
      );

      const offers = response.data.data ?? [];
      return offers.map(
        (i: any): P2POrder => ({
          id: i.adv.advNo,
          price: Number(i.adv.price),
          quantity: Number(i.adv.availableQuantity),
          minSingleTransAmount: Number(i.adv.minSingleTransAmount),
          maxSingleTransAmount: Number(i.adv.maxSingleTransAmount),
          nickname: i.advertiser.nickName,
          payTypes: i.adv.tradeMethods.map((m: any) => m.payType),
          raw: i,
        })
      );
    } catch (error) {
      this.logger.error("Error fetching Binance P2P data:", error);
      return [];
    }
  }

  async okx(q: P2PQuery): Promise<P2POrder[]> {
    const paramsObj: Record<string, string> = {
      quoteCurrency: q.fiat,
      baseCurrency: q.asset,
      side: q.tradeType === "SELL" ? "buy" : "sell",
      userType: "all",
      sortType: q.tradeType.toLowerCase() === "buy" ? "price_asc" : "price_desc",
      paymentMethod: "bank",
    };

    const url =
      "https://www.okx.com/v3/c2c/tradingOrders/books?" +
      new URLSearchParams(paramsObj).toString();

    try {
      const resp = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/114.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          Referer: "https://www.okx.com/c2c",
          Origin: "https://www.okx.com",
        },
      });

      const raw: any[] = resp.data?.data?.[paramsObj.side] ?? [];
      if (!Array.isArray(raw)) return [];

      const filtered =
        q.amount == null
          ? raw
          : raw.filter((o) => {
              const min = Number(o.quoteMinAmountPerOrder);
              const max = Number(o.quoteMaxAmountPerOrder);
              return (q.amount ?? 0) >= min && (q.amount ?? 0) <= max;
            });

      return filtered.slice(0, 5).map((o) => ({
        id: o.id,
        price: Number(o.price),
        quantity: Number(o.availableAmount),
        minSingleTransAmount: Number(o.quoteMinAmountPerOrder),
        maxSingleTransAmount: Number(o.quoteMaxAmountPerOrder),
        nickname: o.nickName,
        payTypes: o.paymentMethods,
      }));
    } catch (err: any) {
      this.logger.error("Error fetching OKX P2P data:", err.response?.data || err.message);
      return [];
    }
  }

  async bybit(q: P2PQuery): Promise<P2POrder[]> {
    try {
      const paymentTypeMap: Record<string, string> = {
        Monobank: "43",
        Abank: "1",
      };

      const paymentType = q.payTypes?.map((type) => paymentTypeMap[type] || type);

      const body = {
        userId: "",
        tokenId: q.asset,
        currencyId: q.fiat,
        payment: paymentType,
        side: q.tradeType === "BUY" ? "1" : "0",
        size: (q.rows ?? 20).toString(),
        page: (q.page ?? 1).toString(),
        amount: q.amount?.toString() ?? "",
        vaMaker: false,
        bulkMaker: false,
        canTrade: false,
        verificationFilter: 0,
        sortType: "TRADE_PRICE",
        paymentPeriod: [] as string[],
        itemRegion: 1,
      };

      const response = await axios.post("https://api2.bybit.com/fiat/otc/item/online", body, {
        headers: { "Content-Type": "application/json" },
      });

      const items: any[] = response.data?.result?.items ?? [];
      return items.map((i: any) => ({
        id: i.id,
        price: Number(i.price),
        quantity: Number(i.quantity),
        minSingleTransAmount: Number(i.minAmount),
        maxSingleTransAmount: Number(i.maxAmount),
        nickname: i.nickName,
        payTypes: i.payments ?? [],
        raw: i,
      }));
    } catch (error: any) {
      this.logger.error("Error fetching Bybit P2P data:", error.response?.status, error.message);
      return [];
    }
  }
}
