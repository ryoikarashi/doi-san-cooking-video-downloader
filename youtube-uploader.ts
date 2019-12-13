const sharp = require('sharp');
import fetch from 'node-fetch';
import { mkdirSync, statSync, createReadStream, createWriteStream, existsSync, writeFileSync, readFileSync } from 'fs';
import { createInterface, clearLine, cursorTo } from 'readline';
import { google } from 'googleapis';
import { config } from 'dotenv';
import { promisify } from "util";
import { pipeline } from "stream";
import { basename, join } from "path";
import { argv } from 'yargs';

const OAuth2 = google.auth.OAuth2;

// load environmental variables
config();

// If modifying these scopes, delete your previously saved credentials
// ./.credentials/youtube-uploader.json
const SCOPES = [
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.upload',
];
const TOKEN_DIR = './.credentials/';
const TOKEN_FILE_NAME = 'youtube-uploader.json';
const TOKEN_PATH = `${TOKEN_DIR}${TOKEN_FILE_NAME}`;

// Load client secrets from a local file.
export const YoutubeUploader = (videoFilePath: string, videoTitle: string, videoDescription: string, thumbnailUrl: string) => new Promise (resolve => {
    if (argv.upload !== true) return;
    try {
        const content = JSON.parse(readFileSync('client_secret.json', 'utf8'));
        // Authorize a client with the loaded credentials, then call the YouTube API.
        authorize(content, startUploadingVideoAndThumbnail(videoFilePath, videoTitle, videoDescription, thumbnailUrl, resolve));
    } catch (err) {
        console.log(err);
    }
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
const authorize = (credentials, callback) => {
    const clientSecret = credentials.installed.client_secret;
    const clientId = credentials.installed.client_id;
    const redirectUrl = credentials.installed.redirect_uris[0];
    const oauth2Client = new OAuth2(clientId, clientSecret, redirectUrl);

    try {
        // Check if we have previously stored a token.
        oauth2Client.credentials = JSON.parse(readFileSync(TOKEN_PATH, 'utf8'));
        callback(oauth2Client);
    } catch (err) {
        getNewToken(oauth2Client, callback);
    }

};

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
const getNewToken = (oauth2Client, callback) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
    });
    console.log(`Authorize this app by visiting this url: ${authUrl}`);
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oauth2Client.getToken(code, (err, token) => {
            if (err) {
                console.log('Error while trying to retrieve access token', err);
                return;
            }
            oauth2Client.credentials = token;
            storeToken(token);
            callback(oauth2Client);
        });
    });
};

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
const storeToken = (token) => {
    try {
        mkdirSync(TOKEN_DIR);
    } catch (err) {
        if (err.code != 'EEXIST') {
            throw err;
        }
    }

    writeFileSync(TOKEN_PATH, JSON.stringify(token));
    console.log(`Token stored to ${TOKEN_PATH}`);
};

/**
 * Start uploading a video and its thumbnail
 *
 * @param {String} videoFilePath Path to a video file
 * @param {String} videoTitle Title of a video
 * @param {String} videoDescription Description of a video
 * @param {String} thumbnailUrl Thumbnail url of a video
 */
const startUploadingVideoAndThumbnail = (videoFilePath: string, videoTitle: string, videoDescription: string, thumbnailUrl: string, resolve) => async (auth) => {
    if (!isEnvDataValid()) return;
    const { id } = await uploadVideo(auth, videoFilePath, videoTitle, videoDescription);
    if (!id) return resolve();
    await uploadThumbnail(auth, id, thumbnailUrl);
    argv.playlist === true && await addUploadedVideoToPlaylist(auth, id);
    return resolve();
};

/**
 * Check if environment variables are valid
 *
 */
const isEnvDataValid = () => {
    if (argv.playlist === true && !process.env.PLAYLIST_ID) {
        console.log('Invalid `PLAYLIST_ID`');
        return false;
    }

    if (!process.env.THUMBNAIL_DEST) {
        console.log('Invalid `THUMBNAIL_DEST`');
        return false;
    }

    return true;
};

/**
 * Add a video to a playlist
 *
 * @param auth
 * @param {String} youtubeVideoId
 */
const addUploadedVideoToPlaylist = async (auth, youtubeVideoId: string) => {
    const service = google.youtube('v3');
    const res = await service.playlistItems.insert(
        {
            auth,
            part: 'id,snippet,status',
            requestBody: {
                snippet: {
                    playlistId: process.env.PLAYLIST_ID,
                    resourceId: {
                        kind: 'youtube#video',
                        videoId: youtubeVideoId,
                    },
                },
                status: {
                    privacyStatus: 'private',
                },
            },
        },
    );

    return res.data;
};

/**
 * Check if a video to upload is already uploaded on youtube
 *
 * @param {String} videoTitle
 */
const videoExists = (videoTitle: string) => {
    const uploadedVideoListFile = 'uploaded_video_list.json';
    const pathToUploadedVideoListFile = join(process.env.VIDEO_DEST, uploadedVideoListFile);
    if (!existsSync(pathToUploadedVideoListFile)) {
        const json = JSON.stringify([videoTitle]);
        writeFileSync(pathToUploadedVideoListFile, json);
        return false;
    }

    const videoList = JSON.parse(readFileSync(pathToUploadedVideoListFile, 'utf8'));
    const videoExists = videoList.includes(videoTitle);
    if (!videoExists) {
        videoList.push(videoTitle);
        const json = JSON.stringify(videoList);
        writeFileSync(pathToUploadedVideoListFile, json);
        return false;
    }

    return true;
};

/**
 * Upload a video to youtube
 *
 * @param auth
 * @param {String} videoFilePath Path to a video file
 * @param {String} videoTitle Title of a video
 * @param {String} videoDescription Description of a video
 */
const uploadVideo = async (auth, videoFilePath: string, videoTitle: string, videoDescription: string) => {
    const service = google.youtube('v3');
    const fileSize = statSync(videoFilePath).size;
    if (videoExists(videoTitle)) {
        console.log(`[CANCEL] ${videoTitle} is already uploaded.`);
        return { id : null };
    }
    const res = await service.videos.insert(
        {
            auth,
            part: 'id,snippet,status',
            notifySubscribers: false,
            requestBody: {
                snippet: {
                    title: videoTitle,
                    description: videoDescription,
                },
                status: {
                    privacyStatus: 'private',
                },
            },
            media: {
                body: createReadStream(videoFilePath),
            },
        },
        {
            onUploadProgress: evt => {
                const progress = (evt.bytesRead / fileSize) * 100;
                clearLine(process.stdout, 0);
                cursorTo(process.stdout, 0, null);
                process.stdout.write(`Uploading a video - ${Math.round(progress)}% complete`);
            },
        }
    );

    return res.data;
};

type ThumbnailResponse = {
    body: string;
    contentType: string;
    contentLength: string;
};

/**
 * Resize the original video thumbnail (Youtube requires images less than 2MB)
 *
 * @param {String} thumbnailUrl
 */
const getResizedThumbnail = async (thumbnailUrl: string): Promise<ThumbnailResponse> => {
    const output = join(process.env.THUMBNAIL_DEST, basename(thumbnailUrl));
    const response = await fetch(thumbnailUrl);
    const streamPipeline = promisify(pipeline);
    await streamPipeline(response.body, createWriteStream(output));
    const data = await sharp(output)
        .resize(1500)
        .toFormat('jpeg');

    return {
        body: data,
        contentLength: data.toBuffer().toString().length,
        contentType: 'image/jpeg',
    };
};

/**
 * Upload a video thumbnail
 *
 * @param auth
 * @param {String} videoId
 * @param {String} thumbnailUrl
 */
const uploadThumbnail = async (auth, videoId: string, thumbnailUrl: string) => {
    const service = google.youtube('v3');
    const thumbnailResponse = await getResizedThumbnail(thumbnailUrl);

    await service.thumbnails.set(
        {
            auth,
            videoId,
            media: {
                mimeType: thumbnailResponse.contentType,
                body: thumbnailResponse.body,
            },
        },
        {
            onUploadProgress: evt => {
                const progress = (evt.bytesRead / Number(thumbnailResponse.contentLength)) * 100;
                clearLine(process.stdout, 0);
                cursorTo(process.stdout, 0, null);
                process.stdout.write(`Uploading a thumbnail - ${Math.round(progress)}% complete`);
            },
        },
    );
};
