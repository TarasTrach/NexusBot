import fs from "fs";
import * as path from "path";
import ytdl from "@distube/ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import axios from "axios";
import sharp from "sharp";
import { unlinkAsync } from "./fileUtils";

export async function downloadYouTubeAudio(videoUrl: any, outputPath: any) {
  try {
    const info = await ytdl.getInfo(videoUrl);
    const formats = info.formats;

    let candidates = formats.filter((fmt) => fmt.hasAudio);
    candidates.sort((a, b) => {
      const aBit = a.audioBitrate || a.bitrate || 0;
      const bBit = b.audioBitrate || b.bitrate || 0;
      return bBit - aBit;
    });

    if (candidates.length === 0) {
      candidates = formats;
    }

    const dir = path.dirname(outputPath);
    await fs.promises.mkdir(dir, { recursive: true });

    let lastError = null;
    for (const candidate of candidates) {
      try {
        await attemptDownload(videoUrl, candidate, outputPath);
        console.log(
          `Success, downloaded ${candidate.audioBitrate} kbps with ${candidate.audioQuality} quality`
        );
        return;
      } catch (error) {
        lastError = error;
        try {
          await fs.promises.unlink(outputPath);
        } catch (e) {}
      }
    }

    throw lastError;
  } catch (error) {
    console.error(`Помилка під час завантаження: ${error}`);
    throw error;
  }
}

function attemptDownload(videoUrl: any, candidate: any, outputPath: any) {
  return new Promise<void>((resolve, reject) => {
    const videoStream = ytdl(videoUrl, { format: candidate });
    videoStream.on("error", (error) => {
      reject(error);
    });
    const fileStream = fs.createWriteStream(outputPath);
    fileStream.on("error", (error) => {
      reject(error);
    });
    fileStream.on("finish", () => {
      resolve();
    });
    videoStream.pipe(fileStream);
  });
}

export async function convertToMp3(
  videoPath: string,
  savePath: string
): Promise<void> {
  try {
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .audioBitrate(320)
        .save(savePath)
        .on("end", resolve)
        .on("error", reject);
    });
  } catch (error: any) {
    throw error;
  }
}

export async function downloadThumbnail(
  thumbnailUrl: string,
  savePath: string
): Promise<void> {
  try {
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
  } catch (error: any) {
    throw error;
  }
}

export async function cleanUpFiles(
  videoPath: string,
  audioPath: string,
  thumbnailPath: string
): Promise<void> {
  try {
    await unlinkAsync(videoPath);
    await unlinkAsync(audioPath);
    await unlinkAsync(thumbnailPath);
  } catch (error: any) {
    throw error;
  }
}

export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[<>:"\/\\|?*\x00-\x1F]/g, "_").trim();
}
