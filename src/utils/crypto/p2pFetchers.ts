import axios from "axios";

export interface P2PQuery {
  asset: string; // USDT, BTC...
  fiat: string; //  USD, UAH...
  tradeType: string;
  amount?: number;
  payTypes?: string[];
  page?: number;
  rows?: number;
}

export interface P2POrder {
  id: string;
  price: number;
  quantity: number;
  minSingleTransAmount: number;
  maxSingleTransAmount: number;
  recentOrderNum?: number;
  nickname?: string;
  payTypes?: string[];
  raw?: any;
}

export interface P2POrderWithExchange extends P2POrder {
  exchange: "Binance" | "OKX" | "Bybit" | "Kucoin";
}

export async function binanceP2P(q: P2PQuery) {
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
    console.error("Error fetching Binance P2P data:", error);
  }
}

export async function okxP2P(q: P2PQuery): Promise<P2POrder[]> {
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
    console.error(
      "Error fetching OKX P2P data:",
      err.response?.data || err.message
    );
    return [];
  }
}

export async function bybitP2P(q: P2PQuery): Promise<P2POrder[]> {
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

    const url = "https://api2.bybit.com/fiat/otc/item/online";

    const response = await axios.post(url, body, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    const items: any[] = response.data?.result?.items ?? [];
    const result = items.map((i: any) => ({
      id: i.id,
      price: Number(i.price),
      quantity: Number(i.quantity),
      minSingleTransAmount: Number(i.minAmount),
      maxSingleTransAmount: Number(i.maxAmount),
      nickname: i.nickName,
      payTypes: i.payments ?? [],
      raw: i,
    }));    
    return result;
  } catch (error: any) {
    console.error(
      "Error fetching Bybit P2P data:",
      error.response?.status,
      error.message
    );
    return [];
  }
}

export async function kucoinP2P(q: P2PQuery) {
  try {
    const params = {
      status: "PUTUP",
      currency: q.asset,
      legal: q.fiat,
      side: q.tradeType.toUpperCase() == "BUY" ? "SELL" : "BUY",
      payTypeCodes: q.payTypes,
      page: q.page ?? 1,
      pageSize: q.rows ?? 20,
      amount: q.amount,
      sortCode: "PRICE",
      highQualityMerchant: 0,
      canDealOrder: false,
      lang: "en_US",
    };

    const response = await axios.get(
      "https://www.kucoin.com/_api/otc/ad/list",
      {
        params,
      }
    );
    const data = response.data;

    if (!data.success) {
      console.error("Kucoin P2P API returned unsuccessful:", data);
      return [];
    }

    return (data.items as any[]).map((i) => ({
      id: i.id,
      price: Number(i.floatPrice),
      quantity: Number(i.currencyQuantity),
      minSingleTransAmount: Number(i.limitMinQuote),
      maxSingleTransAmount: Number(i.limitMaxQuote),
      nickname: i.nickName,
      payTypes: (i.adPayTypes || []).map((p: any) => p.payTypeCode),
      raw: i,
    }));
  } catch (error) {
    console.error("Error fetching Kucoin P2P data:", error);
    return [];
  }
}

export async function searchAllP2P(
  q: P2PQuery
): Promise<P2POrderWithExchange[]> {
  const [binance, okx, bybit] = await Promise.all([
    binanceP2P(q),
    okxP2P(q),
    bybitP2P(q),
    // kucoinP2P(q),
  ]);

  const tag = (
    arr: P2POrder[] | undefined,
    exchange: P2POrderWithExchange["exchange"]
  ) => (arr ?? []).map((o) => ({ ...o, exchange }));

  return [
    ...tag(binance, "Binance"),
    ...tag(okx, "OKX"),
    ...tag(bybit, "Bybit"),
    // ...tag(kucoin, "Kucoin"),
  ];
}
