const sharp = require('sharp');
import fetch from 'node-fetch';
import { readFile, writeFile, mkdirSync, statSync, createReadStream, readFileSync, createWriteStream } from 'fs';
import { createInterface, clearLine, cursorTo } from 'readline';
import { google } from 'googleapis';
import { config } from 'dotenv';
import { promisify } from "util";
import { pipeline } from "stream";
import {basename, join} from "path";

const OAuth2 = google.auth.OAuth2;

// load environmental variables
config();

// If modifying these scopes, delete your previously saved credentials
// at ./.credentials/youtube-nodejs-quickstart.json
const SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.upload',
];
const TOKEN_DIR = './.credentials/';
const TOKEN_FILE_NAME = 'youtube-uploader.json';
const TOKEN_PATH = `${TOKEN_DIR}${TOKEN_FILE_NAME}`;

// Load client secrets from a local file.
export const YoutubeUploader = (videoFilePath: string, videoTitle: string, videoDescription: string, thumbnailUrl: string) => {
    readFile('client_secret.json', function processClientSecrets(err, content) {
        if (err) {
            console.log(`Error loading client secret file: ${err}`);
            return;
        }
        // Authorize a client with the loaded credentials, then call the YouTube API.
        authorize(JSON.parse(`${content}`), startUploadingVideoAndThumbnail(videoFilePath, videoTitle, videoDescription, thumbnailUrl));
    });
};

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
    const clientSecret = credentials.installed.client_secret;
    const clientId = credentials.installed.client_id;
    const redirectUrl = credentials.installed.redirect_uris[0];
    const oauth2Client = new OAuth2(clientId, clientSecret, redirectUrl);

    // Check if we have previously stored a token.
    readFile(TOKEN_PATH, function(err, token) {
        if (err) {
            getNewToken(oauth2Client, callback);
        } else {
            oauth2Client.credentials = JSON.parse(`${token}`);
            callback(oauth2Client);
        }
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
    });
    console.log(`Authorize this app by visiting this url: ${authUrl}`);
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question('Enter the code from that page here: ', function(code) {
        rl.close();
        oauth2Client.getToken(code, function(err, token) {
            if (err) {
                console.log('Error while trying to retrieve access token', err);
                return;
            }
            oauth2Client.credentials = token;
            storeToken(token);
            callback(oauth2Client);
        });
    });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
    try {
        mkdirSync(TOKEN_DIR);
    } catch (err) {
        if (err.code != 'EEXIST') {
            throw err;
        }
    }
    writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) throw err;
        console.log(`Token stored to ${TOKEN_PATH}`);
    });
}

/**
 * Start uploading a video and its thumbnail
 *
 * @param {String} videoFilePath Path to a video file
 * @param {String} videoTitle Title of a video
 * @param {String} videoDescription Description of a video
 * @param {String} thumbnailUrl Thumbnail url of a video
 */
const startUploadingVideoAndThumbnail = (videoFilePath: string, videoTitle: string, videoDescription: string, thumbnailUrl: string) => async (auth) => {
    const { id } = await uploadVideo(auth, videoFilePath, videoTitle, videoDescription);
    await uploadThumbnail(auth, id, thumbnailUrl);
};

/**
 * Lists the names and IDs of up to 10 files.
 *
 * @param auth
 * @param {String} videoFilePath Path to a video file
 * @param {String} videoTitle Title of a video
 * @param {String} videoDescription Description of a video
 */
const uploadVideo = async (auth, videoFilePath: string, videoTitle: string, videoDescription: string) => {
    console.log(`Uploading ${videoFilePath}...`);
    const service = google.youtube('v3');
    const fileSize = statSync(videoFilePath).size;
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

