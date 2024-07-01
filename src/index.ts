import TelegramAPI from 'node-telegram-bot-api';
import { startBot } from './bot/bot';
import 'dotenv/config'

const BOT_TOKEN = process.env.BOT_TOKEN || '';

const bot = new TelegramAPI(BOT_TOKEN, {
    polling: {
        interval: 100,
        autoStart: true,
    }
});

startBot(bot);
