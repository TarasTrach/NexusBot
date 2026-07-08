import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CryptoModule } from "./crypto/crypto.module";
import { P2PModule } from "./p2p/p2p.module";
import { SettingsModule } from "./settings/settings.module";
import { TelegramModule } from "./telegram/telegram.module";
import { YoutubeModule } from "./youtube/youtube.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.get("POSTGRES_HOST", "localhost"),
        port: parseInt(config.get("POSTGRES_PORT", "5432"), 10),
        username: config.get("POSTGRES_USER", "nexusbot"),
        password: config.get("POSTGRES_PASSWORD", "nexusbot"),
        database: config.get("POSTGRES_DB", "nexusbot"),
        autoLoadEntities: true,
        // Єдина key-value таблиця налаштувань: синхронізація схеми безпечна.
        // При появі складніших таблиць — перейти на міграції.
        synchronize: true,
      }),
    }),
    SettingsModule,
    P2PModule,
    CryptoModule,
    YoutubeModule,
    TelegramModule,
  ],
})
export class AppModule {}
