import TelegramAPI from "node-telegram-bot-api";

export async function welcomeMessage(bot: TelegramAPI, chatID: number) {
  const text = [
    "Hello mate! Nice to meet you👋",
    "This is bot for getting additional info about @UpworkTaras",
    "",
    "Available commands:",
    "/cryptofees - for getting actual fees PayPal/Payoneer -> Crypro conversion",
    "",
    "Have a nice day!",
  ].join("\n");
  try {
    await bot.sendMessage(chatID, text);
  } catch (e) {
  }
}
