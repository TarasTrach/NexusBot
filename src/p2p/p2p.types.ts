export interface P2PQuery {
  asset: string; // USDT, BTC...
  fiat: string; //  USD, UAH...
  tradeType: string;
  amount?: number | null;
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
  exchange: "Binance" | "OKX" | "Bybit";
}
