import TelegramAPI from "node-telegram-bot-api";
import convertYoutubeVideoToMp3 from "../services/convertYoutubeVideoToMp3.service";
import {
  exchangeObnalSchemaLive,
  exchangePaypalToUsdtLive,
  getSecondTopFullFeePercentOnce,
  updatePaypalRate,
  updateDiscountAndUsd,
  calculatePaypalAmountForCrypto,
  calculatePaypalAmountForNbuLimit,
} from "../services/crypto.service";

const adminChatID = 891948666;

export function startBot(bot: TelegramAPI) {
  bot.setMyCommands([
    { command: "/convertmp3", description: "Convert YouTube video to MP3" },
    { command: "/paypalrate", description: "PayPal update rate" },
    { command: "/settings", description: "Update settings" },
    { command: "/exchange", description: "PayPal exchange" },
    { command: "/bybit", description: "Bybit" },
  ]);

  bot.on("message", async (msg: TelegramAPI.Message) => {
    const chatID = msg.chat.id;
    const text = msg.text ?? "";

    try {
      switch (text) {
        case "/convertmp3":
          if (chatID !== adminChatID) break;
          bot.sendMessage(chatID, "Send me a YouTube video link");
          bot.once("message", async (msg: TelegramAPI.Message) => convertYoutubeVideoToMp3(chatID, bot, msg.text ?? ""));
          break;

        case "/obnal":
          if (chatID !== adminChatID) break;
          calculatePaypalAmountForNbuLimit(bot, chatID);
          break;

        case "/exchange": {
          if (chatID !== adminChatID) break;
          await exchangePaypalToUsdtLive(chatID, bot);
          break;
        }

        case "/paypalrate": {
          if (chatID !== adminChatID) break;
          await updatePaypalRate(bot, chatID);
          break;
        }

        case "/settings": {
          if (chatID !== adminChatID) break;
          await updateDiscountAndUsd(bot, chatID);
          break;
        }

        case "/bybit": {
          if (chatID !== adminChatID) break;
          await calculatePaypalAmountForCrypto(bot, chatID);
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
