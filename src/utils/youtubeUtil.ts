import fs from 'fs';
import ytdl from 'ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import axios from 'axios';
import sharp from 'sharp';
import { unlinkAsync } from './fileUtils';

export async function downloadVideo(url: string, savePath: string): Promise<void> {
    await new Promise((resolve, reject) => {
        ytdl(url, { filter: 'audioonly' })
            .pipe(fs.createWriteStream(savePath))
            .on('finish', resolve)
            .on('error', reject);
    });
}

export async function convertToMp3(videoPath: string, savePath: string): Promise<void> {
    await new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .audioBitrate(320)
            .save(savePath)
            .on('end', resolve)
            .on('error', reject);
    });
}

export async function downloadThumbnail(thumbnailUrl: string, savePath: string): Promise<void> {
    const thumbnailResponse = await axios.get(thumbnailUrl, { responseType: 'arraybuffer' });

    await sharp(thumbnailResponse.data)
        .resize(320, 320, {
            fit: 'cover',
            position: 'center'
        })
        .jpeg({ quality: 100 })
        .toFile(savePath);
}

export async function cleanUpFiles(videoPath: string, audioPath: string, thumbnailPath: string): Promise<void> {
    await unlinkAsync(videoPath);
    await unlinkAsync(audioPath);
    await unlinkAsync(thumbnailPath);
}

export function ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}