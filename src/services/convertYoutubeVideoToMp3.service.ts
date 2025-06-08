import TelegramAPI from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import ytdl from "@distube/ytdl-core";
import { sanitizeFileName } from "../utils/youtubeUtil";
import {
  downloadYouTubeAudio,
  convertToMp3,
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
    if (!ytdl.validateURL(url)) {
      await bot.sendMessage(chatID, "Invalid YouTube video URL");
      return;
    }

    await bot.sendMessage(chatID, "Please wait, conversion is in progress...");

    const videoInfo = await ytdl.getInfo(url);
    const videoTitle = sanitizeFileName(videoInfo.videoDetails.title);
    const thumbnailUrl = videoInfo.videoDetails.thumbnails[0].url;

    const cacheDir = path.join(__dirname, "../utils/cache");

    if (fs.existsSync(cacheDir)) {
      const existingFiles = await fs.promises.readdir(cacheDir);
      for (const file of existingFiles) {
        await fs.promises.unlink(path.join(cacheDir, file));
      }
    }

    ensureDirectoryExists(cacheDir);

    const videoPath = path.join(cacheDir, `${videoTitle}.mp4`);
    const audioPath = path.join(cacheDir, `${videoTitle}.mp3`);
    const thumbnailPath = path.join(cacheDir, `${videoTitle}.jpg`);

    await downloadYouTubeAudio(url, videoPath);
    console.log("Downloaded YouTube audio");
    await downloadThumbnail(thumbnailUrl, thumbnailPath);
    await convertToMp3(videoPath, audioPath);

    const mp3Data = fs.readFileSync(audioPath);
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

    await bot.sendAudio(chatID, mp3Data, options, fileOptions);

    cleanUpFiles(videoPath, audioPath, thumbnailPath);
  } catch (error: any) {
    throw error;
  }
}
