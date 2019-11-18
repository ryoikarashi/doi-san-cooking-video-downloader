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
X_UDID=YOUR_X_UDID
X_ADID=YOUR_X_ADID
VIDEO_DEST=YOUR_VIDEO_DESTINATION
```

Finally, run this code below.

```bash
npx tsc download.ts && node download.js
```

## Notes

- Your video destination folder, `VIDEO_DEST` will be roughly **50GB**. So be sure to have enough disk space.
- You need to be a premium member to download videos.
- For only offline use.
