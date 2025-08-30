import TelegramAPI from "node-telegram-bot-api";
import { getSecondTopFullFeePercentOnce } from "../services/crypto.service";
import { createRateLimiter } from "../utils/rateLimiter";
import { welcomeMessage } from "../services/welcome.service";

const limiter = createRateLimiter(5_000, 1);

export function startBot(bot: TelegramAPI) {
  bot.setMyCommands([{ command: "/cryptofees", description: "PayPal/Payoneer fees" }]);

  bot.on("message", async (msg: TelegramAPI.Message) => {
    const chatID = msg.chat.id;
    const text = msg.text ?? "";

    if (text.startsWith("/")) {
      if (limiter.isRateLimited(chatID)) {
        bot.sendMessage(chatID, "Don't spam, try in 5 seconds.");
        return;
      }
    }

    try {
      switch (text) {
		  case "/start": {
          await welcomeMessage(bot, chatID);
          break;
        }
        case "/cryptofees": {
          await getSecondTopFullFeePercentOnce(bot, chatID);
          break;
        }
        default:
          break;
      }
    } catch (error: any) {
      console.error("Error handling message:", error);
    }
  });
}
