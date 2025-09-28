import TelegramAPI from "node-telegram-bot-api";
import { startBot as startMainBot } from "./bots/mainBot";
import { startBot as startClientBot } from "./bots/clientBot";
import "dotenv/config";

const MAIN_BOT_TOKEN = process.env.MAIN_BOT_TOKEN || "";
const CLIENT_BOT_TOKEN = process.env.CLIENT_BOT_TOKEN || "";

async function launchBot(label: string, token: string, starter: (bot: TelegramAPI) => void) {
  try {
    const bot = new TelegramAPI(token, {
      polling: { interval: 100, autoStart: true },
    });
    starter(bot);
    const me = await bot.getMe();
    console.log(`[BOT] ${label} started: @${me.username} (id=${me.id})`);
  } catch (err) {
    console.error(`[BOT] Failed to start ${label}:`, err);
  }
}

async function main() {
  if (!MAIN_BOT_TOKEN) {
    console.error("[BOT] MAIN_BOT_TOKEN is missing (.env)");
  } else {
    await launchBot("MainBot", MAIN_BOT_TOKEN, startMainBot);
  }

  if (!CLIENT_BOT_TOKEN) {
    console.warn("[BOT] CLIENT_BOT_TOKEN not provided – client bot skipped");
  } else {
    await launchBot("ClientBot", CLIENT_BOT_TOKEN, startClientBot);
  }
}

main();
