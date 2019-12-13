# doi-san-recipe-video-downloader

## Requirements

- node >= 11.x
- ffmpeg >= 3.4

## Installation

```bash
yarn
```

## How to use

Create `.env` by copying `.env.example`

```bash
cp .env.example .env
```

Then edit `.env` file and fill out with your own data.

```env
API_VERSION=YAPPLI_API_VERSION
USER_AGENT=YOUR_USER_AGENT
X_UDID=YOUR_X_UDID
X_ADID=YOUR_X_ADID
VIDEO_DEST='./videos' (You can change it to any directory you want)
THUMBNAIL_DEST='./thumbnails' (You can change it to any directory you want)
PLAYLIST_ID=YOUR_PLAYLIST_ID (Your youtube playlist ID *required when you add `--playlist` option)
```

Then compile typescript to javascript

```bash
npx tsc downloader.ts
```

Finally run this code below.

```bash
node downloader.js
```

You can also specify some options. Check the list below.

## Options

| option | description |
| ------- | ----------- |
| `--upload` | upload downloaded videos to Youtube (private) |
| `--playlist` | add uploaded videos to playlist (Requires `--upload` option.) |


## Notes

- Your video destination folder, `VIDEO_DEST` will be roughly **50GB**. So be sure to have enough disk space.
- You need to be a premium member to download videos.
- For only offline use.

# Enjoy Cooking! :)
