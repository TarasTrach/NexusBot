import TelegramAPI from 'node-telegram-bot-api';
import convertYoutubeVideoToMp3 from '../modules/convertYoutubeVideoToMp3';

export function startBot(bot: TelegramAPI) {
    bot.setMyCommands([
        { command: '/convertmp3', description: 'Convert YouTube video to MP3' },
        { command: '/test', description: 'Test' },
    ]);

    bot.on('message', async (msg: TelegramAPI.Message) => {
        const chatID = msg.chat.id;
        const text = msg.text;

        try {
            switch (text) {

                case '/convertmp3':
                    bot.sendMessage(chatID, 'Send me a YouTube video link');

                    bot.once('message', async (msg: TelegramAPI.Message) => {
                        const receivedUrl: any = msg.text;

                        convertYoutubeVideoToMp3(chatID, bot, receivedUrl);
                    });
                    break;

                default:
                    break;
            }
        }
        catch (error: any) {
            console.error('Error handling message:', error);
        }
    });
}
