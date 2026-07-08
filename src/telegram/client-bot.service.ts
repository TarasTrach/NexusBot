import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Optional,
} from "@nestjs/common";
import TelegramAPI from "node-telegram-bot-api";
import { FeesService } from "../crypto/fees.service";
import { RateLimiter } from "./rate-limiter";
import { CLIENT_BOT } from "./telegram.constants";

const WELCOME_TEXT = [
  "Hello mate! Nice to meet you👋",
  "This is bot for getting additional info about @UpworkTaras",
  "",
  "Available commands:",
  "/cryptofees - for getting actual fees PayPal/Payoneer -> Crypro conversion",
  "",
  "Have a nice day!",
].join("\n");

@Injectable()
export class ClientBotService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ClientBotService.name);
  private readonly limiter = new RateLimiter(5_000, 1);

  constructor(
    @Optional() @Inject(CLIENT_BOT) private readonly bot: TelegramAPI | null,
    private readonly fees: FeesService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.bot) {
      this.logger.warn("CLIENT_BOT_TOKEN not provided – client bot skipped");
      return;
    }
    const bot = this.bot;

    bot.setMyCommands([{ command: "/cryptofees", description: "PayPal/Payoneer fees" }]);

    bot.on("message", async (msg: TelegramAPI.Message) => {
      const chatID = msg.chat.id;
      const text = msg.text ?? "";

      if (text.startsWith("/") && this.limiter.isRateLimited(chatID)) {
        bot.sendMessage(chatID, "Don't spam, try in 5 seconds.");
        return;
      }

      try {
        switch (text) {
          case "/start":
            await bot.sendMessage(chatID, WELCOME_TEXT).catch(() => undefined);
            break;

          case "/cryptofees":
            await this.fees.getSecondTopFullFeePercentOnce(bot, chatID);
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
      this.logger.log(`ClientBot started: @${me.username} (id=${me.id})`);
    } catch (err) {
      this.logger.error("Failed to start ClientBot:", err);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.bot?.stopPolling().catch(() => undefined);
  }
}
