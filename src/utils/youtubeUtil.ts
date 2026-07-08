import fs from "fs";
import * as path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import axios from "axios";
import sharp from "sharp";
import { unlinkAsync } from "./fileUtils";
import { execYtDlp } from "./ytDlp";

ffmpeg.setFfmpegPath(ffmpegStatic as string);

const YT_URL_REGEX =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)/;

export function isValidYouTubeUrl(url: string): boolean {
  return YT_URL_REGEX.test(url);
}

export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/shorts\/|music\.youtube\.com\/watch\?.*v=)([\w-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function cleanYouTubeUrl(url: string): string {
  const id = extractVideoId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : url;
}

export async function getVideoInfo(
  url: string
): Promise<{ title: string; thumbnailUrl: string }> {
  const cleanUrl = cleanYouTubeUrl(url);
  const stdout = await execYtDlp(["--dump-json", "--no-download", cleanUrl]);
  const info = JSON.parse(stdout);
  return {
    title: info.title,
    thumbnailUrl: info.thumbnail,
  };
}

export async function downloadYouTubeAsMp3(
  videoUrl: string,
  outputPath: string
): Promise<void> {
  const dir = path.dirname(outputPath);
  await fs.promises.mkdir(dir, { recursive: true });

  const ffmpegDir = path.dirname(ffmpegStatic as string);
  const baseName = outputPath.replace(/\.mp3$/, "");
  const cleanUrl = cleanYouTubeUrl(videoUrl);
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
    cleanUrl,
  ]);
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
