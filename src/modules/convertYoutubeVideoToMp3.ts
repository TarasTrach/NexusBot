import TelegramAPI from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import ytdl from 'ytdl-core';
import { downloadVideo, convertToMp3, downloadThumbnail, cleanUpFiles, ensureDirectoryExists } from '../utils/youtubeUtil';

export default async function convertYoutubeVideoToMp3(chatId: number, bot: TelegramAPI, url: string) {
    try {
        if (!ytdl.validateURL(url)) {
            throw new Error('Invalid URL. Please try again.');
        }

        await bot.sendMessage(chatId, 'Please wait, conversion is in progress...');

        const videoInfo = await ytdl.getInfo(url);
        const videoTitle = videoInfo.videoDetails.title;
        const thumbnailUrl = videoInfo.videoDetails.thumbnails[0].url;

        const cacheDir = path.join(__dirname, '../utils/cache');
        ensureDirectoryExists(cacheDir);

        const videoPath = path.join(cacheDir, `${videoTitle}.mp4`);
        const audioPath = path.join(cacheDir, `${videoTitle}.mp3`);
        const thumbnailPath = path.join(cacheDir, `${videoTitle}.jpg`);

        await downloadVideo(url, videoPath);
        await convertToMp3(videoPath, audioPath);
        await downloadThumbnail(thumbnailUrl, thumbnailPath);

        const mp3Data = fs.readFileSync(audioPath);
        const options = {
            thumb: thumbnailPath,
            title: videoTitle,
        };
        const fileOptions = {
            filename: `${videoTitle}.mp3`,
            contentType: 'audio/mpeg',
            thumb: {
                source: thumbnailPath
            }
        };

        await bot.sendAudio(chatId, mp3Data, options, fileOptions);

        cleanUpFiles(videoPath, audioPath, thumbnailPath);

    } catch (error: any) {
        console.error('Error during conversion process:', error);
        throw error;
    }
}