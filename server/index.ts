import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
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
