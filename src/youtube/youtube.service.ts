import fs from "fs";
import os from "os";
import path from "path";
import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import ffmpegStatic from "ffmpeg-static";
import TelegramAPI from "node-telegram-bot-api";
import sharp from "sharp";
import { execYtDlp } from "./yt-dlp";

const YT_URL_REGEX =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)/;

@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);
  private readonly cacheDir = path.join(os.tmpdir(), "nexusbot-cache");

  async convertToMp3(bot: TelegramAPI, chatID: number, url: string): Promise<void> {
    try {
      if (!this.isValidYouTubeUrl(url) || !this.extractVideoId(url)) {
        await bot.sendMessage(chatID, "Invalid YouTube video URL");
        return;
      }

      await bot.sendMessage(chatID, "Please wait, conversion is in progress...");

      this.logger.log(`Starting conversion for URL: ${url}`);
      const { title, thumbnailUrl } = await this.getVideoInfo(url);
      const videoTitle = this.sanitizeFileName(title);
      this.logger.log(`Video title: ${videoTitle}`);

      await this.resetCacheDir();

      const audioPath = path.join(this.cacheDir, `${videoTitle}.mp3`);
      const thumbnailPath = path.join(this.cacheDir, `${videoTitle}.jpg`);

      await this.downloadAsMp3(url, audioPath);
      await this.downloadThumbnail(thumbnailUrl, thumbnailPath);

      const mp3Data = fs.readFileSync(audioPath);
      this.logger.log(`MP3 size: ${(mp3Data.length / 1024 / 1024).toFixed(2)} MB, sending...`);
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
      this.logger.log("Audio sent successfully");

      await fs.promises.unlink(audioPath);
      await fs.promises.unlink(thumbnailPath);
    } catch (error) {
      this.logger.error("Conversion failed:", error);
      throw error;
    }
  }

  isValidYouTubeUrl(url: string): boolean {
    return YT_URL_REGEX.test(url);
  }

  extractVideoId(url: string): string | null {
    const match = url.match(
      /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/shorts\/|music\.youtube\.com\/watch\?.*v=)([\w-]{11})/
    );
    return match ? match[1] : null;
  }

  private cleanYouTubeUrl(url: string): string {
    const id = this.extractVideoId(url);
    return id ? `https://www.youtube.com/watch?v=${id}` : url;
  }

  private async getVideoInfo(url: string): Promise<{ title: string; thumbnailUrl: string }> {
    const stdout = await execYtDlp(["--dump-json", "--no-download", this.cleanYouTubeUrl(url)]);
    const info = JSON.parse(stdout);
    return {
      title: info.title,
      thumbnailUrl: info.thumbnail,
    };
  }

  private async downloadAsMp3(videoUrl: string, outputPath: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    const ffmpegDir = path.dirname(ffmpegStatic as string);
    const baseName = outputPath.replace(/\.mp3$/, "");
    await execYtDlp([
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "-o",
      `${baseName}.%(ext)s`,
      "--ffmpeg-location",
      ffmpegDir,
      this.cleanYouTubeUrl(videoUrl),
    ]);
  }

  private async downloadThumbnail(thumbnailUrl: string, savePath: string): Promise<void> {
    const thumbnailResponse = await axios.get(thumbnailUrl, {
      responseType: "arraybuffer",
    });

    await sharp(thumbnailResponse.data)
      .resize(320, 320, {
        fit: "cover",
        position: "center",
      })
      .jpeg({ quality: 100 })
      .toFile(savePath);
  }

  private async resetCacheDir(): Promise<void> {
    if (fs.existsSync(this.cacheDir)) {
      const existingFiles = await fs.promises.readdir(this.cacheDir);
      for (const file of existingFiles) {
        await fs.promises.unlink(path.join(this.cacheDir, file));
      }
    }
    await fs.promises.mkdir(this.cacheDir, { recursive: true });
  }

  private sanitizeFileName(fileName: string): string {
    return fileName.replace(/[<>:"\/\\|?*\x00-\x1F]/g, "_").trim();
  }
}
