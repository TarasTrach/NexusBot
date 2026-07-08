import { Module, Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import TelegramAPI from "node-telegram-bot-api";
import { CryptoModule } from "../crypto/crypto.module";
import { YoutubeModule } from "../youtube/youtube.module";
import { ClientBotService } from "./client-bot.service";
import { MainBotService } from "./main-bot.service";
import { CLIENT_BOT, MAIN_BOT } from "./telegram.constants";

function createBotProvider(provide: string, envKey: string): Provider {
  return {
    provide,
    inject: [ConfigService],
    useFactory: (config: ConfigService): TelegramAPI | null => {
      const token = config.get<string>(envKey);
      if (!token) return null;
      return new TelegramAPI(token, {
        polling: { interval: 100, autoStart: true },
      });
    },
  };
}

@Module({
  imports: [CryptoModule, YoutubeModule],
  providers: [
    createBotProvider(MAIN_BOT, "MAIN_BOT_TOKEN"),
    createBotProvider(CLIENT_BOT, "CLIENT_BOT_TOKEN"),
    MainBotService,
    ClientBotService,
  ],
})
export class TelegramModule {}
