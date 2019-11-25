import fetch from 'node-fetch';
import { join } from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { config } from 'dotenv';
import { Entry, YappliResponse } from "./response";
import { YoutubeUploader } from "./youtube-uploader";

// load environmental variables
config();

const REQUEST_HEADER = {
    'Accept': '*',
    'X-API-VERSION': process.env.YAPPLI_API_VERSION,
    'User-Agent': process.env.USER_AGENT,
    'Accept-Language': 'en-us',
    'X-UDID': process.env.X_UDID,
    'X-ADID': process.env.X_ADID,
};

const YAPPLI_INFO = {
    host: 'yapp.li',
    protocol: 'https',
    port: 443,
    apiPath: '/api',
};

const API_ENDPOINT = `${YAPPLI_INFO.protocol}://${YAPPLI_INFO.host}:${YAPPLI_INFO.port}${YAPPLI_INFO.apiPath}`;

const ENDPOINTS = {
    normalVideos: `${API_ENDPOINT}/tab/bio/a608b295`,
    wanokokoroVideos: `${API_ENDPOINT}/tab/bio/b6ce08d3`,
    specialVideos: `${API_ENDPOINT}/tab/bio/a1e886ec`,
};

const getEntries = async (endpoint: string) => {
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: REQUEST_HEADER,
    });
    const data: YappliResponse = await response.json();
    return data.feed.entry;
};

const getEntryDetail = async (entry: Entry) => {
    if (!entry || !entry.link || !entry.link[0]) throw new Error('unexpected entry link');
    const response = await fetch(entry.link[0]._href, {
       method: 'GET',
       headers: REQUEST_HEADER,
    });
    const data: YappliResponse = await response.json();
    return data.feed.entry;
};

const getVideoDetail = async (entryDetail: Array<Entry>) => {
    if (!entryDetail || !entryDetail[0].link) throw new Error('unexpected video detail');
    const videoUrl =  entryDetail[0].link[0]._href;
    if (!videoUrl) throw new Error('unexpected video url');
    const response = await fetch(videoUrl, {
        method: 'GET',
        headers: REQUEST_HEADER,
    });
    const data: YappliResponse = await response.json();
    return data.feed.entry;
};

const getVideoUrl = (videoDetail: Array<Entry>): string => {
    if (!videoDetail || !videoDetail[0].link) throw new Error('unexpected video url');
    return videoDetail[0].link[0]._href;
};

const getVideoTitle = (videoDetail: Array<Entry>): string => {
    if (!videoDetail || !videoDetail[0].title) throw new Error('unexpected video title');
    return videoDetail[0].title.replace(/(\s|\/|\.)/g, '');
};

const findOrCreateDirectory = (endpointKey: string) => {
    const directoryPath = join(process.env.VIDEO_DEST, endpointKey);
    if (!existsSync(directoryPath)) {
        mkdirSync(directoryPath, { recursive: true });
    }
    return directoryPath;
};

const downloadM3u8 = async (url: string, title: string, directory: string) => {
    if (!url.match(/^https:\/\/n\.yapp\.li\//)) throw new Error('unexpected m3u8 link');
    const output = join(directory, `${title}.m3u8`);
    if (existsSync(output)) {
        console.log(`Skip downloading because ${output} is already downloaded.`);
        return output;
    }
    console.log(`Start downloading! -- ${output}`);
    const response = await fetch(url, { headers: REQUEST_HEADER});
    if (!response.ok) throw new Error(`unexpected response ${response.statusText}`);
    const streamPipeline = promisify(pipeline);
    await streamPipeline(response.body, createWriteStream(output));
    console.log(`Finished downloading! -- ${output}`);
    return output;
};

const convertM3u8ToMp4 = async (m3u8: string, title: string, directory: string)  => {
    const output = join(directory, `${title}.mp4`);
    if (existsSync(output)) {
        console.log(`Skip downloading because ${output} is already downloaded.`);
        return output;
    }
    console.log(`Start downloading! -- ${output}`);
    execSync(`ffmpeg -loglevel panic -protocol_whitelist file,http,https,tcp,tls,crypto -i ${m3u8} -c copy -bsf:a aac_adtstoasc ${output}`);
    console.log(`Finished downloading! -- ${output}`);
    return output;
};

const downloadVideos = async (endpoint: [string, string]) => {
    const entries = await getEntries(endpoint[1]);
    for(const entry of entries) {
        try {
            const entryData = await getEntryDetail(entry);
            const videoData = endpoint[0] === 'wanokokoroVideos' ? entryData : await getVideoDetail(entryData);
            const videoUrl = getVideoUrl(videoData);
            const videoTitle = getVideoTitle(videoData);
            const directory = findOrCreateDirectory(endpoint[0]);
            const m3u8 = await downloadM3u8(videoUrl, videoTitle, directory);
            const mp4 = await convertM3u8ToMp4(m3u8, videoTitle, directory);
            // YoutubeUploader(mp4);
        } catch (err) {}
    }
};

(async () => {
    const endpoints = Object.entries(ENDPOINTS);
    for (const endpoint of endpoints) {
        console.log('-----------------------------------------');
        console.log(`Downloading ${endpoint[0]}`);
        console.log('-----------------------------------------');
        await downloadVideos(endpoint);
    }
})();
