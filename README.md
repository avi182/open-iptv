<div align="center">

# OpenIPTV

**Your streams, one guide.**

Browse channels, see what's on now, search programmes, catch up on past shows, download recordings, and play in VLC — all from your browser.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white)](#quick-start)

<!-- Add a screenshot here: ![Screenshot](screenshot.png) -->

</div>

---

## Features

- **Bring Your Own Playlist** — paste any M3U URL, EPG is auto-detected
- **Live Now** — card grid of what's airing with real-time progress bars
- **Full Programme Guide** — past, live, and upcoming shows grouped by day
- **Catch-Up TV** — replay programmes from the past 7 days on supported channels
- **Search** — find shows instantly across titles, descriptions, and channels
- **Filters** — by day, channel group, or individual channel
- **Star Shows** — bookmark programmes to find them later, saved per playlist
- **Download** — save any programme as MP4 with one click (via ffmpeg)
- **One-Click Playback** — copy stream URLs or open directly in VLC
- **Responsive** — works on desktop, tablet, and mobile

## Quick Start

> **Prerequisite:** [Docker](https://docs.docker.com/get-docker/) must be installed on your machine.

```bash
git clone https://github.com/avi182/openiptv.git
cd openiptv
docker compose up
```

Open **http://localhost:4200** — that's it.

### Usage

1. Paste your M3U playlist URL and click **Load Playlist**
2. Browse what's on now, search for shows, or explore the full schedule
3. Star shows to save them for later, or click **Download MP4** to save a recording
4. Click **Copy URL** or **VLC** on any programme to start watching

### Custom Port

```bash
docker compose up -e PORT=8080 -p 8080:8080
```

## Updating

```bash
git pull
docker compose up --build
```

---

<details>
<summary><strong>Development</strong></summary>

### Prerequisites

- Node.js >= 18
- npm >= 9

### Run in dev mode

```bash
npm install
npm run dev
```

The client runs at `http://localhost:4200` and the API at `http://localhost:4201`. Vite proxies `/api` requests to the backend automatically.

### Project Structure

```
openiptv/
├── client/               # React frontend (Vite)
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── utils/        # Catch-up URL building, clipboard, VLC helpers
│   │   ├── api.ts        # API client
│   │   ├── types.ts      # TypeScript interfaces
│   │   └── App.tsx       # Main app component
│   └── vite.config.ts
├── server/               # Express backend
│   ├── parsers/
│   │   ├── m3u.ts        # M3U playlist parser
│   │   └── epg.ts        # XMLTV EPG parser (gzip support)
│   ├── index.ts          # Express server with caching
│   └── types.ts
├── Dockerfile
├── docker-compose.yml
└── package.json          # npm workspaces root
```

### API

| Endpoint | Description |
| --- | --- |
| `GET /api/playlist?url=<m3u-url>` | Parses an M3U playlist, returns channels + detected EPG URL |
| `GET /api/epg?playlistUrl=<m3u-url>` | Fetches EPG programme data for the given playlist |
| `GET /api/probe?url=<stream-url>&duration=<s>` | Probes stream bitrate and estimates file size |
| `GET /api/download?url=<stream-url>&duration=<s>&filename=<name>` | Downloads stream as MP4 via ffmpeg |

### Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite |
| Backend | Express, TypeScript |
| Parsing | fast-xml-parser, zlib |
| Streaming | ffmpeg, ffprobe |

</details>

## License

[MIT](LICENSE)
