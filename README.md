# NexusBot

Два Telegram-боти на NestJS + PostgreSQL:

- **MainBot** (адмінський): P2P-курси й комісії PayPal→USDT, YouTube→MP3.
- **ClientBot** (публічний): актуальні комісії обміну (`/cryptofees`).

## Стек

- [NestJS](https://nestjs.com) (standalone application context — без HTTP-сервера)
- PostgreSQL + TypeORM (налаштування зберігаються у таблиці `bot_settings`)
- `node-telegram-bot-api` (polling)
- `yt-dlp` + `ffmpeg-static` для конвертації аудіо

## Структура

```
src/
├── main.ts              # bootstrap
├── app.module.ts        # кореневий модуль, конфіг TypeORM
├── settings/            # key-value налаштування у Postgres (+сід зі старих txt)
├── p2p/                 # фетчери P2P-ордерів: Binance, OKX, Bybit
├── crypto/              # розрахунки комісій та інтерактивні діалоги обміну
├── youtube/             # YouTube → MP3 (yt-dlp)
└── telegram/            # інстанси ботів і роутинг команд
```

## Запуск

1. Скопіюй `.env.example` → `.env`, задай токени ботів.
2. Підніми Postgres:

   ```bash
   docker compose up -d postgres
   ```

3. Запусти бота:

   ```bash
   npm install
   npm run start:dev   # розробка (watch)
   # або
   npm run build && npm start
   ```

Повністю в Docker (Postgres + бот):

```bash
docker compose up -d --build
```

## Команди ботів

**MainBot** (лише для `ADMIN_CHAT_ID`): `/convertmp3`, `/paypalrate`, `/settings`, `/exchange`, `/bybit`, `/obnal` (прихована).

**ClientBot**: `/start`, `/cryptofees`.

## Налаштування у БД

Таблиця `bot_settings` (key-value): `paypal_rate`, `usd_amount`, `discount_percent`, `order_index`. Редагуються командами `/paypalrate` та `/settings`. При першому старті на порожній базі значення імпортуються зі старих `src/config/*.txt` (якщо є), інакше — дефолти.

Схема таблиці створюється автоматично (`synchronize: true`) — якщо зʼявляться складніші таблиці, варто перейти на міграції TypeORM.
