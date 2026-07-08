import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import TelegramAPI from "node-telegram-bot-api";
import { ExchangeFlowsService } from "../crypto/exchange-flows.service";
import { FeesService } from "../crypto/fees.service";
import { YoutubeService } from "../youtube/youtube.service";
import { MAIN_BOT } from "./telegram.constants";

@Injectable()
export class MainBotService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MainBotService.name);
  private readonly adminChatID: number;

  constructor(
    @Optional() @Inject(MAIN_BOT) private readonly bot: TelegramAPI | null,
    config: ConfigService,
    private readonly youtube: YoutubeService,
    private readonly fees: FeesService,
    private readonly flows: ExchangeFlowsService
  ) {
    this.adminChatID = Number(config.get("ADMIN_CHAT_ID", "891948666"));
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.bot) {
      this.logger.warn("MAIN_BOT_TOKEN not provided – main bot skipped");
      return;
    }
    const bot = this.bot;

    bot.setMyCommands([
      { command: "/convertmp3", description: "Convert YouTube video to MP3" },
      { command: "/paypalrate", description: "PayPal update rate" },
      { command: "/settings", description: "Update settings" },
      { command: "/exchange", description: "PayPal exchange" },
      { command: "/bybit", description: "Bybit" },
    ]);

    bot.on("message", async (msg: TelegramAPI.Message) => {
      const chatID = msg.chat.id;
      if (chatID !== this.adminChatID) return;
      const text = msg.text ?? "";

      try {
        switch (text) {
          case "/convertmp3":
            bot.sendMessage(chatID, "Send me a YouTube video link");
            bot.once("message", (reply: TelegramAPI.Message) =>
              this.youtube
                .convertToMp3(bot, chatID, reply.text ?? "")
                .catch((err) => this.logger.error("convertmp3 failed:", err))
            );
            break;

          case "/obnal":
            this.fees.calculatePaypalAmountForNbuLimit(bot, chatID);
            break;

          case "/exchange":
            await this.flows.exchangePaypalToUsdtLive(bot, chatID);
            break;

          case "/paypalrate":
            await this.flows.updatePaypalRate(bot, chatID);
            break;

          case "/settings":
            await this.flows.updateDiscountAndUsd(bot, chatID);
            break;

          case "/bybit":
            await this.fees.calculatePaypalAmountForCrypto(bot, chatID);
            break;

          default:
            break;
        }
      } catch (error) {
        this.logger.error("Error handling message:", error);
      }
    });

    try {
      const me = await bot.getMe();
      this.logger.log(`MainBot started: @${me.username} (id=${me.id})`);
    } catch (err) {
      this.logger.error("Failed to start MainBot:", err);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.bot?.stopPolling().catch(() => undefined);
  }
}
