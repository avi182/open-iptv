import path from "path";
import { fileURLToPath } from "url";
import { execFile, spawn } from "child_process";
import express from "express";
import { parseM3U } from "./parsers/m3u.js";
import { fetchAndParseEpg } from "./parsers/epg.js";
import type { Channel, Programme } from "./types.js";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4201;

// Serve the built client in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, "..", "..", "client", "dist");
app.use(express.static(clientDist));

// In-memory cache keyed by playlist URL
const playlistCache = new Map<
  string,
  { channels: Channel[]; epgUrl: string; timestamp: number }
>();
const epgCache = new Map<
  string,
  { data: Programme[]; timestamp: number }
>();

const PLAYLIST_TTL = 60 * 60 * 1000; // 1 hour
const EPG_TTL = 6 * 60 * 60 * 1000; // 6 hours
const MAX_CACHE_ENTRIES = 50;

function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function evictOldest(cache: Map<string, { timestamp: number }>) {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  let oldestKey = '';
  let oldestTime = Infinity;
  for (const [key, val] of cache) {
    if (val.timestamp < oldestTime) {
      oldestTime = val.timestamp;
      oldestKey = key;
    }
  }
  if (oldestKey) cache.delete(oldestKey);
}

async function fetchPlaylist(playlistUrl: string) {
  const cached = playlistCache.get(playlistUrl);
  if (cached && Date.now() - cached.timestamp < PLAYLIST_TTL) {
    return cached;
  }

  console.log("Fetching playlist...");
  const response = await fetch(playlistUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`Playlist fetch failed: HTTP ${response.status}`);
  }
  const text = await response.text();
  const { channels, epgUrl } = parseM3U(text);

  const entry = { channels, epgUrl, timestamp: Date.now() };
  playlistCache.set(playlistUrl, entry);
  evictOldest(playlistCache);
  console.log(`Parsed ${channels.length} channels, EPG URL: ${epgUrl || "(not found in M3U)"}`);
  return entry;
}

app.get("/api/playlist", async (req, res) => {
  try {
    const playlistUrl = req.query.url as string | undefined;
    if (!playlistUrl) {
      return res.status(400).json({ error: "Missing 'url' query parameter" });
    }
    if (!validateUrl(playlistUrl)) {
      return res.status(400).json({ error: "Invalid URL: must be an http or https URL" });
    }

    const { channels, epgUrl } = await fetchPlaylist(playlistUrl);
    res.json({ channels, epgUrl });
  } catch (err) {
    console.error("Playlist fetch error:", err);
    res.status(500).json({ error: "Failed to fetch playlist" });
  }
});

app.get("/api/epg", async (req, res) => {
  try {
    const playlistUrl = req.query.playlistUrl as string | undefined;
    if (!playlistUrl) {
      return res.status(400).json({ error: "Missing 'playlistUrl' query parameter" });
    }
    if (!validateUrl(playlistUrl)) {
      return res.status(400).json({ error: "Invalid URL: must be an http or https URL" });
    }

    const cachedEpg = epgCache.get(playlistUrl);
    if (cachedEpg && Date.now() - cachedEpg.timestamp < EPG_TTL) {
      return res.json({ programmes: cachedEpg.data });
    }

    // Need channels + EPG URL from playlist
    const { channels, epgUrl } = await fetchPlaylist(playlistUrl);

    if (!epgUrl) {
      return res.status(400).json({ error: "No EPG URL found in playlist (missing url-tvg in #EXTM3U header)" });
    }

    const validIds = new Set(channels.map((c) => c.id));

    console.log("Fetching EPG (this may take a moment)...");
    const programmes = await fetchAndParseEpg(epgUrl, validIds);
    epgCache.set(playlistUrl, { data: programmes, timestamp: Date.now() });
    evictOldest(epgCache);

    console.log(`Parsed ${programmes.length} programmes`);
    res.json({ programmes });
  } catch (err) {
    console.error("EPG fetch error:", err);
    res.status(500).json({ error: "Failed to fetch EPG" });
  }
});

app.get("/api/open-vlc", (req, res) => {
  const url = req.query.url as string | undefined;
  if (!url) {
    return res.status(400).json({ error: "Missing 'url' query parameter" });
  }
  if (!validateUrl(url)) {
    return res.status(400).json({ error: "Invalid URL" });
  }
  execFile("open", ["-a", "VLC", url], (err) => {
    if (err) {
      console.error("Failed to open VLC:", err);
      return res.status(500).json({ error: "Failed to open VLC" });
    }
    res.json({ ok: true });
  });
});

function probeStreamBitrate(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-i", url,
    ], { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("Probe timed out"));
    }, 15000);

    proc.on("close", () => {
      clearTimeout(timeout);
      try {
        const data = JSON.parse(stdout);
        const bitrate = parseInt(data.format?.bit_rate || "0", 10);
        resolve(bitrate);
      } catch {
        reject(new Error("Failed to parse probe output"));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

app.get("/api/probe", async (req, res) => {
  const url = req.query.url as string | undefined;
  const duration = req.query.duration as string | undefined;

  if (!url) {
    return res.status(400).json({ error: "Missing 'url' query parameter" });
  }
  if (!validateUrl(url)) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  try {
    const bitrate = await probeStreamBitrate(url);
    const dur = duration ? parseInt(duration, 10) : 0;
    const estimatedBytes = dur > 0 && bitrate > 0 ? Math.ceil((bitrate / 8) * dur) : 0;
    res.json({ bitrate, estimatedBytes });
  } catch (err) {
    console.error("Probe error:", err);
    res.status(500).json({ error: "Failed to probe stream" });
  }
});

app.get("/api/download", async (req, res) => {
  const url = req.query.url as string | undefined;
  const duration = req.query.duration as string | undefined;
  const filename = (req.query.filename as string | undefined) || "download.mp4";

  if (!url) {
    return res.status(400).json({ error: "Missing 'url' query parameter" });
  }
  if (!validateUrl(url)) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  const safeFilename = filename.replace(/[^a-zA-Z0-9._\-() ]/g, "_");
  const dur = duration ? parseInt(duration, 10) : 0;

  // Probe bitrate for Content-Length so browsers can show download progress
  let estimatedSize = 0;
  try {
    const bitrate = await probeStreamBitrate(url);
    if (bitrate > 0 && dur > 0) {
      estimatedSize = Math.ceil((bitrate / 8) * dur);
    }
  } catch {
    // Probe failed — proceed without Content-Length
  }

  const args: string[] = ["-i", url];

  if (dur > 0) {
    args.push("-t", String(dur));
  }

  args.push(
    "-c", "copy",
    "-bsf:a", "aac_adtstoasc",
    "-movflags", "frag_keyframe+empty_moov",
    "-f", "mp4",
    "pipe:1"
  );

  const ffmpeg = spawn("ffmpeg", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let headersSent = false;
  let stderrOutput = "";

  ffmpeg.stderr.on("data", (chunk: Buffer) => {
    stderrOutput += chunk.toString();
    if (!headersSent && stderrOutput.includes("Output #0")) {
      headersSent = true;
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeFilename}"`
      );
      if (estimatedSize > 0) {
        res.setHeader("Content-Length", estimatedSize);
      }
      ffmpeg.stdout.pipe(res);
    }
  });

  ffmpeg.on("error", (err) => {
    console.error("ffmpeg spawn error:", err);
    if (!headersSent) {
      res.status(500).json({
        error: (err as NodeJS.ErrnoException).code === "ENOENT"
          ? "ffmpeg is not installed on the server"
          : "Failed to start download",
      });
    }
  });

  ffmpeg.on("close", (code) => {
    if (!headersSent) {
      console.error("ffmpeg exited with code", code, "stderr:", stderrOutput.slice(-500));
      res.status(500).json({ error: "Failed to download stream. The stream may be unavailable." });
    }
  });

  req.on("close", () => {
    if (!ffmpeg.killed) {
      ffmpeg.kill("SIGTERM");
    }
  });
});

// Return 404 for unknown API routes instead of serving the SPA
app.all("/api/*", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// SPA catch-all: serve index.html for non-API routes
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
