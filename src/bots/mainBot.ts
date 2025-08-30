import TelegramAPI from "node-telegram-bot-api";
import convertYoutubeVideoToMp3 from "../services/convertYoutubeVideoToMp3.service";
import {
  exchangeObnalSchemaLive,
  exchangePaypalToUsdtLive,
  getSecondTopFullFeePercentOnce,
  updatePaypalRate,
  updateDiscountAndUsd,
} from "../services/crypto.service";
import { randomizePassword } from "../utils/randomizers";

const adminChatID = 891948666;

export function startBot(bot: TelegramAPI) {
  bot.setMyCommands([
    { command: "/convertmp3", description: "Convert YouTube video to MP3" },
    { command: "/randomizepass", description: "Randomize password" },
    { command: "/paypalrate", description: "PayPal update rate" },
    { command: "/settings", description: "Update settings" },
    { command: "/exchange", description: "PayPal exchange" },
    { command: "/cryptofees", description: "PayPal/Payoneer fees" },
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
          exchangeObnalSchemaLive(chatID, bot);
          break;

        case "/randomizepass": {
          if (chatID !== adminChatID) break;
          bot.sendMessage(chatID, "Будь ласка, надішліть ваше ім'я та прізвище через пробіл");
          bot.once("message", async (msg: TelegramAPI.Message) => {
            try {
              const args = msg.text?.split(" ") || [];
              if (args.length < 2) {
                bot.sendMessage(chatID, "Будь ласка, використовуйте формат: FirstName LastName");
                return;
              }
              const firstName = args[0].toLowerCase();
              const lastName = args[1].toLowerCase();

              const password = randomizePassword();
              const emailPassword = password.slice(0, 4) + "E" + password.slice(4);

              const fourRandom = password.slice(7, 11);

              const primaryEmail = `${firstName}.${lastName}${fourRandom}@ukr.net`;

              const message = `#UpworkEmails\n${primaryEmail}\n${emailPassword}\n${password}`;
              bot.sendMessage(chatID, message);
            } catch (error: any) {
              bot.sendMessage(chatID, error.message);
            }
          });
          break;
        }

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

        case "/cryptofees": {
          if (chatID !== adminChatID) break;
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
