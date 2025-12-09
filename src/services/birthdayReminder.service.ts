import fs from "fs";
import path from "path";
import TelegramAPI from "node-telegram-bot-api";

const CONFIG_DIR = path.resolve(__dirname, "../config");
const BIRTHDAY_FILE = path.join(CONFIG_DIR, "birthdays.txt");
const BIRTHDAY_STATE_FILE = path.join(CONFIG_DIR, "birthdays_state.json");
const MS_IN_DAY = 86_400_000;

type ReminderType = "birthday" | "advance";

export interface BirthdayEntry {
  name: string;
  day: number;
  month: number;
  year?: number;
  warnBeforeDays?: number;
}

interface ReminderState {
  sentMap: Record<string, string>;
}

let scheduledTimeout: NodeJS.Timeout | null = null;

export function startBirthdayReminderScheduler(bot: TelegramAPI, adminChatID: number): void {
  ensureBirthdayFile();
  const runDailyReminders = async () => {
    try {
      await sendScheduledReminders(bot, adminChatID);
    } catch (error) {
      console.error("[BirthdayReminder] Failed to send reminders:", error);
    }
  };

  const scheduleNextRun = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(11, 0, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    const delay = next.getTime() - now.getTime();
    scheduledTimeout = setTimeout(async () => {
      await runDailyReminders();
      scheduleNextRun();
    }, delay);
  };

  if (scheduledTimeout) {
    clearTimeout(scheduledTimeout);
  }

  if (hasMissedTodayReminderWindow(new Date())) {
    runDailyReminders();
  }

  scheduleNextRun();
}

export function requestBirthdayEntry(bot: TelegramAPI, chatID: number): void {
  ensureBirthdayFile();

  bot.sendMessage(
    chatID,
    "Надішліть запис у форматі:\nІм'я: ДД.ММ або ДД.ММ.РРРР\nДодатково можна вказати \"через скільки днів нагадати\": Ім'я: ДД.ММ, 3"
  );

  const handler = async (msg: TelegramAPI.Message) => {
    if (msg.chat.id !== chatID) {
      return;
    }

    bot.removeListener("message", handler);

    if (!msg.text) {
      await bot.sendMessage(chatID, "❌ Порожнє повідомлення. Повторіть команду /addbirthday");
      return;
    }

    try {
      const normalizedLine = await appendBirthdayEntryFromInput(msg.text);
      await bot.sendMessage(chatID, `✅ Додано: ${normalizedLine}`);
      await bot.sendMessage(chatID, "Нагадування оновлено. Наступне спрацювання відбудеться о 11:00.");
    } catch (error: any) {
      await bot.sendMessage(chatID, `❌ ${error.message}\nСпробуйте ще раз командою /addbirthday`);
    }
  };

  bot.once("message", handler);
}

export function requestBirthdayRemoval(bot: TelegramAPI, chatID: number): void {
  ensureBirthdayFile();
  const lines = loadBirthdayLines();

  if (!lines.length) {
    bot.sendMessage(chatID, "Список днів народжень порожній.");
    return;
  }

  const listText = lines.map((line, idx) => `${idx + 1}. ${line}`).join("\n");
  bot.sendMessage(
    chatID,
    `Оберіть номер для видалення (0 — скасувати):\n${listText}`
  );

  const handler = async (msg: TelegramAPI.Message) => {
    if (msg.chat.id !== chatID) {
      return;
    }

    bot.removeListener("message", handler);
    const reply = msg.text?.trim();
    if (!reply) {
      await bot.sendMessage(chatID, "❌ Порожнє повідомлення. Спробуйте ще раз командою /removebirthday.");
      return;
    }

    if (reply === "0") {
      await bot.sendMessage(chatID, "Скасовано.");
      return;
    }

    const index = Number(reply);
    if (!Number.isInteger(index) || index < 1 || index > lines.length) {
      await bot.sendMessage(chatID, "❌ Невірний номер. Повторіть команду /removebirthday для нового вибору.");
      return;
    }

    try {
      const removed = await removeBirthdayAtIndex(index - 1);
      await bot.sendMessage(chatID, `🗑 Видалено: ${removed.removedLine}`);
    } catch (error: any) {
      await bot.sendMessage(chatID, `❌ ${error.message}`);
    }
  };

  bot.once("message", handler);
}

async function sendScheduledReminders(bot: TelegramAPI, adminChatID: number): Promise<void> {
  const birthdays = loadBirthdays();
  if (!birthdays.length) {
    return;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayIso = formatIsoDate(today);
  const state = loadReminderState();
  let stateDirty = false;

  for (const entry of birthdays) {
    const diff = calculateDaysUntilBirthday(entry, today);
    if (diff === 0) {
      if (markReminderIfNeeded(state, entry, "birthday", todayIso)) {
        await sendReminder(bot, adminChatID, entry, "birthday", diff);
        stateDirty = true;
      }
    } else if (typeof entry.warnBeforeDays === "number" && entry.warnBeforeDays > 0 && diff === entry.warnBeforeDays) {
      if (markReminderIfNeeded(state, entry, "advance", todayIso)) {
        await sendReminder(bot, adminChatID, entry, "advance", diff);
        stateDirty = true;
      }
    }
  }

  if (stateDirty) {
    saveReminderState(state);
  }
}

function loadBirthdays(): BirthdayEntry[] {
  return loadBirthdayLines()
    .map((line) => {
      try {
        return parseBirthdayLine(line);
      } catch (error) {
        console.warn(`[BirthdayReminder] Пропускаю некоректний запис "${line}":`, error);
        return null;
      }
    })
    .filter((entry): entry is BirthdayEntry => Boolean(entry));
}

function loadBirthdayLines(): string[] {
  ensureBirthdayFile();
  const raw = fs.readFileSync(BIRTHDAY_FILE, "utf-8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function appendBirthdayEntryFromInput(input: string): Promise<string> {
  const entry = parseBirthdayLine(input);
  const normalizedLine = formatBirthdayEntry(entry);
  const currentContent = fs.readFileSync(BIRTHDAY_FILE, "utf-8");
  const needsNewLine = currentContent.length > 0 && !currentContent.endsWith("\n");
  const toAppend = `${needsNewLine ? "\n" : ""}${normalizedLine}\n`;
  await fs.promises.appendFile(BIRTHDAY_FILE, toAppend, "utf-8");
  return normalizedLine;
}

async function removeBirthdayAtIndex(index: number): Promise<{ removedLine: string; removedEntry: BirthdayEntry | null }> {
  const lines = loadBirthdayLines();
  if (index < 0 || index >= lines.length) {
    throw new Error("Немає запису з таким номером");
  }

  const [removedLine] = lines.splice(index, 1);
  const parsedEntry = (() => {
    try {
      return parseBirthdayLine(removedLine);
    } catch {
      return null;
    }
  })();

  const nextContent = lines.length ? `${lines.join("\n")}\n` : "";
  await fs.promises.writeFile(BIRTHDAY_FILE, nextContent, "utf-8");
  purgeReminderStateForEntry(parsedEntry);

  return { removedLine, removedEntry: parsedEntry };
}

function parseBirthdayLine(line: string): BirthdayEntry {
  const [rawName, rest] = line.split(":");
  if (!rawName || !rest) {
    throw new Error("Очікую формат: Ім'я: ДД.ММ або Ім'я: ДД.ММ, 3");
  }

  const name = rawName.trim();
  if (!name) {
    throw new Error("Ім'я не може бути порожнім");
  }

  const [rawDate, rawWarn] = rest.split(",");
  const dateText = rawDate.trim();
  if (!dateText) {
    throw new Error("Дата не може бути порожньою");
  }

  const dateMatch = dateText.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/);
  if (!dateMatch) {
    throw new Error("Дата повинна бути у форматі ДД.ММ або ДД.ММ.РРРР");
  }

  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  let year = dateMatch[3] ? Number(dateMatch[3]) : undefined;

  if (month < 1 || month > 12) {
    throw new Error("Місяць має бути від 1 до 12");
  }

  if (day < 1 || day > 31) {
    throw new Error("День має бути від 1 до 31");
  }

  if (typeof year !== "undefined") {
    if (year < 100) {
      year += year >= 70 ? 1900 : 2000;
    }
    if (year < 1900 || year > 2100) {
      throw new Error("Рік має бути у діапазоні 1900-2100");
    }
  }

  const validationYear = year ?? 2000;
  const checkDate = new Date(validationYear, month - 1, day);
  if (checkDate.getMonth() !== month - 1 || checkDate.getDate() !== day) {
    throw new Error("Невалідна дата");
  }

  let warnBeforeDays: number | undefined;
  if (rawWarn) {
    warnBeforeDays = Number(rawWarn.trim());
    if (!Number.isInteger(warnBeforeDays) || warnBeforeDays <= 0 || warnBeforeDays > 365) {
      throw new Error("Кількість днів має бути цілим числом від 1 до 365");
    }
  }

  return { name, day, month, year, warnBeforeDays };
}

function formatBirthdayEntry(entry: BirthdayEntry): string {
  const datePart = entry.year
    ? `${pad(entry.day)}.${pad(entry.month)}.${entry.year}`
    : `${pad(entry.day)}.${pad(entry.month)}`;
  const warnPart = entry.warnBeforeDays ? `, ${entry.warnBeforeDays}` : "";
  return `${entry.name}: ${datePart}${warnPart}`;
}

function calculateDaysUntilBirthday(entry: BirthdayEntry, today: Date): number {
  const currentYear = today.getFullYear();
  const target = new Date(currentYear, entry.month - 1, entry.day);
  if (target < today) {
    target.setFullYear(currentYear + 1);
  }

  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / MS_IN_DAY);
}

async function sendReminder(bot: TelegramAPI, chatID: number, entry: BirthdayEntry, type: ReminderType, diff: number) {
  const dateString = `${pad(entry.day)}.${pad(entry.month)}`;
  const yearSuffix = entry.year ? ` (${entry.year})` : "";
  const fullDateLabel = `${dateString}${yearSuffix}`;

  if (type === "birthday") {
    await bot.sendMessage(chatID, `🎉 Сьогодні день народження у ${entry.name}! (${fullDateLabel})`);
  } else {
    await bot.sendMessage(chatID, `⏰ Через ${diff} ${pluralizeDays(diff)} (${fullDateLabel}) у ${entry.name} день народження.`);
  }
}

function pluralizeDays(value: number): string {
  const abs = Math.abs(value);
  const lastTwo = abs % 100;
  const last = abs % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return "днів";
  }
  if (last === 1) {
    return "день";
  }
  if (last >= 2 && last <= 4) {
    return "дні";
  }
  return "днів";
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function ensureBirthdayFile(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(BIRTHDAY_FILE)) {
    fs.writeFileSync(BIRTHDAY_FILE, "", "utf-8");
  }
  ensureStateFile();
}

function ensureStateFile(): void {
  if (!fs.existsSync(BIRTHDAY_STATE_FILE)) {
    fs.writeFileSync(BIRTHDAY_STATE_FILE, JSON.stringify({ sentMap: {} }, null, 2), "utf-8");
  }
}

function loadReminderState(): ReminderState {
  ensureStateFile();
  try {
    const raw = fs.readFileSync(BIRTHDAY_STATE_FILE, "utf-8").trim();
    if (!raw) {
      return { sentMap: {} };
    }
    const parsed = JSON.parse(raw);
    if (!parsed.sentMap || typeof parsed.sentMap !== "object") {
      return { sentMap: {} };
    }
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.sentMap)) {
      if (typeof value === "string") {
        normalized[key] = value;
      }
    }
    return { sentMap: normalized };
  } catch (error) {
    console.error("[BirthdayReminder] Не вдалося прочитати файл стану, використовую порожній.", error);
    return { sentMap: {} };
  }
}

function saveReminderState(state: ReminderState): void {
  try {
    fs.writeFileSync(BIRTHDAY_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (error) {
    console.error("[BirthdayReminder] Не вдалося зберегти файл стану.", error);
  }
}

function purgeReminderStateForEntry(entry: BirthdayEntry | null): void {
  if (!entry) {
    return;
  }

  const state = loadReminderState();
  const keysToRemove = [buildReminderKey(entry, "birthday"), buildReminderKey(entry, "advance")];
  let dirty = false;

  for (const key of keysToRemove) {
    if (state.sentMap[key]) {
      delete state.sentMap[key];
      dirty = true;
    }
  }

  if (dirty) {
    saveReminderState(state);
  }
}

function markReminderIfNeeded(
  state: ReminderState,
  entry: BirthdayEntry,
  type: ReminderType,
  dateIso: string
): boolean {
  const key = buildReminderKey(entry, type);
  if (state.sentMap[key] === dateIso) {
    return false;
  }
  state.sentMap[key] = dateIso;
  return true;
}

function buildReminderKey(entry: BirthdayEntry, type: ReminderType): string {
  const normalizedName = entry.name.trim().toLowerCase();
  const dateChunk = `${pad(entry.day)}-${pad(entry.month)}`;
  const warnTag = type === "advance" ? `|warn:${entry.warnBeforeDays ?? 0}` : "";
  return `${type}|${normalizedName}|${dateChunk}${warnTag}`;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function hasMissedTodayReminderWindow(now: Date): boolean {
  const reminderTime = new Date(now);
  reminderTime.setHours(11, 0, 0, 0);
  return now >= reminderTime;
}
