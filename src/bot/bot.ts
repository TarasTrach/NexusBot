import TelegramAPI from "node-telegram-bot-api";
import convertYoutubeVideoToMp3 from "../modules/convertYoutubeVideoToMp3Module";
import {
  exchangeObnalSchemaLive,
  exchangePaypalToUsdtSchemaLive,
} from "../modules/cryptoModule";
import { randomizePassword } from "../utils/randomizers";

const adminChatID = 891948666;

export function startBot(bot: TelegramAPI) {
  bot.setMyCommands([
    { command: "/convertmp3", description: "Convert YouTube video to MP3" },
    { command: "/obnal", description: "Calculate obnal exchange" },
    { command: "/randomizepass", description: "Randomize password" },
  ]);

  bot.on("message", async (msg: TelegramAPI.Message) => {
    const chatID = msg.chat.id;
    const text = msg.text ?? "";

    try {
      switch (text) {
        case "/convertmp3":
          bot.sendMessage(chatID, "Send me a YouTube video link");
          bot.once("message", async (msg: TelegramAPI.Message) =>
            convertYoutubeVideoToMp3(chatID, bot, msg.text ?? "")
          );
          break;

        case "/obnal":
          if (chatID === adminChatID) exchangeObnalSchemaLive(chatID, bot);
          break;

        case "/randomizepass": {
          bot.sendMessage(
            chatID,
            "Будь ласка, надішліть ваше ім'я та прізвище через пробіл"
          );
          bot.once("message", async (msg: TelegramAPI.Message) => {
            try {
              const args = msg.text?.split(" ") || [];
              if (args.length < 2) {
                bot.sendMessage(
                  chatID,
                  "Будь ласка, використовуйте формат: FirstName LastName"
                );
                return;
              }
              const firstName = args[0].toLowerCase();
              const lastName = args[1].toLowerCase();

              const password = randomizePassword();
              const emailPassword =
                password.slice(0, 4) + "E" + password.slice(4);

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
          
        case "/paypal": {
          if (chatID === adminChatID) await exchangePaypalToUsdtSchemaLive(chatID, bot);
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
