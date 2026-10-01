<div align="center">

# OpenIPTV

**Your streams, one guide.**

Browse channels, see what's on now, search programmes, catch up on past shows, download recordings, and watch directly in the app — all from your browser.

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
- **Optional Copy & Download** — enable stream-link copying and MP4 downloads in Settings; both are hidden by default and preferences are remembered in your browser
- **Channel Programme Guide** — follow the current programme and select available catch-up shows beside the video on desktop or in a compact, horizontally scrollable strip below it on mobile
- **In-App Player** — select a channel or click Watch for live and catch-up playback, with HLS support, seeking, volume, fullscreen, and picture-in-picture
- **Adaptive Quality** — Auto adjusts resolution to measured download speed; choose 240p, 360p, 480p, 720p, or 1080p manually (up to the source resolution), or Original for direct playback
- **Keyboard Controls** — Space/K to play or pause, arrows to seek or adjust volume, J/L to skip 10 seconds, M to mute, F for fullscreen
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
3. Star shows to save them for later. To copy stream links or download recordings, open the **Settings** gear and enable **Show Copy buttons** or **Show Download buttons**. You can also change your playlist URL from Settings.
4. Select a channel or click **Watch** to start watching in the app. Use **Watch catch-up** for available past programmes.
5. Use the player controls for fullscreen, picture-in-picture (where supported), or **Go live** to return to the live edge. Catch-up shows the full programme duration immediately and lets you seek anywhere in the programme. Live seeking follows the stream’s available DVR window.

The player defaults to **Auto** quality. The server creates aligned H.264/AAC renditions with bounded bitrates, and the browser selects a resolution from measured segment download speed. Use the quality menu to fix a resolution or return to Auto; the choice is saved in that browser. Adaptive video travels through the app's origin, including over Tailscale. **Original** plays the provider stream directly when supported, with conversion for interlaced or incompatible streams. Docker includes FFmpeg; local development requires `ffmpeg` and `ffprobe` on PATH. DRM-protected streams still require a compatible external player. If automatic playback is blocked, press Play.

Adaptive playback starts with about eight seconds of available video and targets roughly ten seconds behind the live edge to absorb mobile-network jitter. Auto starts conservatively and can move between approximately 300 kbps video at 240p and 3.5 Mbps at 1080p, plus audio and transport overhead. Very slow or interrupted connections can still buffer. macOS uses FFmpeg's VideoToolbox H.264 encoder to reduce CPU load; other platforms use x264. Set `PLAYBACK_ENCODER=libx264` to use software encoding on macOS. Multiple renditions use additional server resources; up to four playback sessions can run concurrently.

Each converter keeps a rolling two-minute seek window. Catch-up seeks outside the available window reopen the archive at the selected programme time, including restarting conversion when needed; this can take a few seconds. Changing adaptive resolution keeps the timeline and normally switches within the same playback session. Native browsers that cannot seek an HLS stream reopen catch-up at the current programme position when quality changes. Switching channels or closing the player stops its converter, and abandoned sessions expire after 60 seconds.

### Custom Port

```bash
docker compose up -e PORT=8080 -p 8080:8080
```

### Private access with Tailscale

With Tailscale connected on the host and viewing device, the development app can be shared using Tailscale Serve:

1. Add `TAILSCALE_HOSTNAME=your-machine.your-tailnet.ts.net` to `client/.env.local`, using the host's exact Tailscale DNS name.
2. Start (or restart) `npm run dev`.
3. Run `tailscale serve --bg http://localhost:4200` and open the HTTPS address it prints.

The app and API remain available while the host is awake and the development servers are running. Playlist settings are stored per browser and address, so enter your playlist URL when opening the Tailscale address on a new device. To remove this Serve endpoint, run `tailscale serve --https=443 off`. Existing Serve configurations should be checked before reusing port 443.

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

Run `npm test` for playback selection, seek-window, and real FFmpeg conversion/lifecycle checks (requires FFmpeg and ffprobe), `npm run build` for TypeScript and production builds, and `npm run lint -w client` for frontend linting.

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
| `GET /api/playback/inspect?url=<stream-url>` | Detects interlaced video from decoded frames |
| `POST /api/playback` | Starts temporary HLS playback; JSON body `{url, duration?, adaptive?}` (set `adaptive: true` for multiple quality levels) |
| `POST /api/playback/:id/heartbeat` | Keeps a paused playback session alive |
| `POST /api/playback/:id/stop` | Stops conversion and removes temporary media |
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
