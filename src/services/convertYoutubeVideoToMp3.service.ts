import TelegramAPI from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import { sanitizeFileName } from "../utils/youtubeUtil";
import { unlinkAsync } from "../utils/fileUtils";
import {
  isValidYouTubeUrl,
  extractVideoId,
  getVideoInfo,
  downloadYouTubeAsMp3,
  downloadThumbnail,
  cleanUpFiles,
  ensureDirectoryExists,
} from "../utils/youtubeUtil";

export default async function convertYoutubeVideoToMp3(
  chatID: number,
  bot: TelegramAPI,
  url: string
) {
  try {
    if (!isValidYouTubeUrl(url) || !extractVideoId(url)) {
      await bot.sendMessage(chatID, "Invalid YouTube video URL");
      return;
    }

    await bot.sendMessage(chatID, "Please wait, conversion is in progress...");

    console.log(`[CONVERT] Starting conversion for URL: ${url}`);
    console.log(`[CONVERT] Step 1: Getting video info...`);
    const { title, thumbnailUrl } = await getVideoInfo(url);
    const videoTitle = sanitizeFileName(title);
    console.log(`[CONVERT] Video title: ${videoTitle}`);
    console.log(`[CONVERT] Thumbnail URL: ${thumbnailUrl}`);

    const cacheDir = path.join(__dirname, "../utils/cache");

    if (fs.existsSync(cacheDir)) {
      const existingFiles = await fs.promises.readdir(cacheDir);
      for (const file of existingFiles) {
        await fs.promises.unlink(path.join(cacheDir, file));
      }
    }

    ensureDirectoryExists(cacheDir);

    const audioPath = path.join(cacheDir, `${videoTitle}.mp3`);
    const thumbnailPath = path.join(cacheDir, `${videoTitle}.jpg`);

    console.log(`[CONVERT] Step 2: Downloading as MP3 to ${audioPath}...`);
    await downloadYouTubeAsMp3(url, audioPath);
    console.log(`[CONVERT] Step 3: MP3 download complete`);

    console.log(`[CONVERT] Step 4: Downloading thumbnail...`);
    await downloadThumbnail(thumbnailUrl, thumbnailPath);
    console.log(`[CONVERT] Step 5: Thumbnail download complete`);

    const mp3Data = fs.readFileSync(audioPath);
    console.log(`[CONVERT] Step 6: MP3 size: ${(mp3Data.length / 1024 / 1024).toFixed(2)} MB`);
    const options = {
      thumb: thumbnailPath,
      title: videoTitle,
    };
    const fileOptions = {
      filename: `${videoTitle}.mp3`,
      contentType: "audio/mpeg",
      thumb: {
        source: thumbnailPath,
      },
    };

    console.log(`[CONVERT] Step 7: Sending audio to Telegram...`);
    await bot.sendAudio(chatID, mp3Data, options, fileOptions);
    console.log(`[CONVERT] Step 8: Audio sent successfully!`);

    await unlinkAsync(audioPath);
    await unlinkAsync(thumbnailPath);
    console.log(`[CONVERT] Done, files cleaned up.`);
  } catch (error: any) {
    console.error(`[CONVERT] ERROR:`, error);
    throw error;
  }
}
