import { Router } from 'express';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { adaptiveOutputs, masterPlaylist, renditionsFor } from './quality.js';

const httpUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
};

interface Session {
  id: string;
  directory: string;
  process: ChildProcess;
  touched: number;
  stopped: boolean;
  failure?: string;
}

interface Options {
  ffmpeg?: string;
  ffprobe?: string;
  maxSessions?: number;
  idleMs?: number;
  startupMs?: number;
  encoder?: 'libx264' | 'h264_videotoolbox';
}

export function createPlaybackService(options: Options = {}) {
  const router = Router();
  const sessions = new Map<string, Session>();
  const probes = new Set<ChildProcess>();
  const inspections = new Map<string, { interlaced: boolean; width: number; height: number; expires: number }>();
  let pendingStarts = 0;
  let disposed = false;
  const maxSessions = options.maxSessions ?? 4;
  const idleMs = options.idleMs ?? 60_000;
  const encoder = options.encoder ?? (process.env.PLAYBACK_ENCODER === 'libx264' ? 'libx264' : process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264');

  function kill(process: ChildProcess): Promise<void> {
    if (process.exitCode !== null || process.signalCode !== null || !process.pid) return Promise.resolve();
    return new Promise(resolve => {
      const timer = setTimeout(() => process.kill('SIGKILL'), 2000);
      timer.unref();
      process.once('close', () => { clearTimeout(timer); resolve(); });
      process.kill('SIGTERM');
    });
  }

  async function stop(session: Session) {
    if (session.stopped) return;
    session.stopped = true;
    sessions.delete(session.id);
    await kill(session.process);
    await rm(session.directory, { recursive: true, force: true });
  }

  const reaper = setInterval(() => {
    for (const session of sessions.values()) {
      if (Date.now() - session.touched > idleMs) void stop(session);
    }
  }, Math.min(idleMs, 10_000));
  reaper.unref();

  async function inspect(url: string, signal: AbortSignal) {
    const cached = inspections.get(url);
    if (cached && cached.expires > Date.now()) return cached;
    if (probes.size >= 4 || disposed) throw new Error('Stream inspection is busy. Please retry.');
    return new Promise<{ interlaced: boolean; width: number; height: number; expires: number }>((resolve, reject) => {
      const process = spawn(options.ffprobe ?? 'ffprobe', [
        '-v', 'quiet', '-protocol_whitelist', 'http,https,tcp,tls,crypto', '-rw_timeout', '5000000', '-select_streams', 'v:0',
        '-read_intervals', '%+0.5', '-show_frames', '-show_entries', 'frame=interlaced_frame,width,height', '-of', 'json', url,
      ], { stdio: ['ignore', 'pipe', 'ignore'] });
      probes.add(process);
      let output = '';
      let timedOut = false;
      const abort = () => { void kill(process); };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      const timer = setTimeout(() => { timedOut = true; abort(); }, 8000);
      process.stdout.on('data', (chunk: Buffer) => {
        if (output.length < 256_000) output += chunk.toString();
        else { timedOut = true; abort(); }
      });
      process.on('error', () => reject(new Error('Stream inspection requires ffprobe on the server.')));
      process.on('close', code => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        probes.delete(process);
        try {
          const frames = JSON.parse(output).frames as { interlaced_frame?: number; width: number; height: number }[];
          if (code !== 0 || timedOut || signal.aborted || !frames?.length || !(frames[0].width > 0 && frames[0].height > 0)) throw new Error();
          const info = { interlaced: frames.some(frame => frame.interlaced_frame === 1), width: frames[0].width, height: frames[0].height, expires: Date.now() + 3600_000 };
          if (inspections.size >= 200) inspections.delete(inspections.keys().next().value!);
          inspections.set(url, info);
          resolve(info);
        } catch { reject(new Error('Could not inspect this stream. Please retry.')); }
      });
    });
  }

  router.get('/inspect', async (req, res) => {
    const url = req.query.url;
    if (!httpUrl(url)) { res.status(400).json({ error: 'An HTTP(S) stream URL is required.' }); return; }
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try { res.json(await inspect(url, controller.signal)); }
    catch (error) { if (!res.destroyed) res.status(502).json({ error: (error as Error).message }); }
  });

  router.post('/', async (req, res) => {
    const { url, duration, adaptive = false } = req.body ?? {};
    if (typeof adaptive !== 'boolean') { res.status(400).json({ error: 'Invalid quality mode.' }); return; }
    if (!httpUrl(url)) { res.status(400).json({ error: 'An HTTP(S) stream URL is required.' }); return; }
    if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0 || duration > 86400)) {
      res.status(400).json({ error: 'Invalid programme duration.' }); return;
    }
    if (disposed || sessions.size + pendingStarts >= maxSessions) {
      res.status(503).json({ error: 'All playback converters are busy. Close another player and retry.' }); return;
    }
    pendingStarts++;
    let reserved = true;
    let session: Session | undefined;
    let directory: string | undefined;
    let disconnected = false;
    const startup = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) { disconnected = true; startup.abort(); if (session) void stop(session); }
    });
    try {
      directory = await mkdtemp(path.join(tmpdir(), 'openiptv-playback-'));
      if (disconnected || disposed) { await rm(directory, { recursive: true, force: true }); return; }
      const info = adaptive ? await inspect(url, startup.signal) : undefined;
      const levels = info ? renditionsFor(info.width, info.height) : [];
      if (disconnected || disposed) { await rm(directory, { recursive: true, force: true }); return; }
      if (adaptive) await writeFile(path.join(directory, 'stream.m3u8'), masterPlaylist(levels));
      const args = [
        '-hide_banner', '-loglevel', 'error', '-nostdin', '-protocol_whitelist', 'http,https,tcp,tls,crypto', '-rw_timeout', '10000000',
        '-threads', '2', '-re', '-i', url,
        ...(adaptive ? adaptiveOutputs(levels, directory, duration, encoder) : [
        ...(duration ? ['-t', String(duration)] : []),
        '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn',
        '-filter_threads', '1', '-vf', "yadif=mode=send_frame:parity=auto:deint=all,scale=w='min(1920,iw)':h=-2",
        '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-tune', 'zerolatency',
        '-crf', '23', '-pix_fmt', 'yuv420p', '-force_key_frames', 'expr:gte(t,n_forced*2)', '-sc_threshold', '0',
        '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
        '-f', 'hls', '-hls_time', '2', '-hls_list_size', '60',
        '-hls_flags', 'delete_segments+independent_segments+temp_file',
        '-hls_segment_filename', path.join(directory, 'segment%06d.ts'),
        path.join(directory, 'stream.m3u8'),
        ]),
      ];
      const process = spawn(options.ffmpeg ?? 'ffmpeg', args, { stdio: ['ignore', 'ignore', 'ignore'] });
      session = { id: randomUUID(), directory, process, touched: Date.now(), stopped: false };
      const active = session;
      sessions.set(active.id, active);
      pendingStarts--;
      reserved = false;
      process.on('error', (error: NodeJS.ErrnoException) => {
        active.failure = error.code === 'ENOENT' ? 'Playback conversion requires ffmpeg on the server.' : 'Could not start playback conversion.';
      });
      process.on('close', code => {
        if (code !== 0 && !active.stopped) active.failure = active.failure ?? 'Could not convert this stream. It may be unavailable.';
      });
      const deadline = Date.now() + (options.startupMs ?? 30_000);
      while (!active.stopped && !disconnected && !active.failure && Date.now() < deadline) {
        active.touched = Date.now();
        const playlists = await Promise.all((adaptive ? levels.map(level => `quality${level.height}.m3u8`) : ['stream.m3u8'])
          .map(file => readFile(path.join(directory!, file), 'utf8').catch(() => '')));
        if (playlists.every(playlist => (playlist.match(/#EXTINF:/g)?.length ?? 0) >= (adaptive ? 4 : 2) || (playlist.includes('#EXTINF:') && playlist.includes('#EXT-X-ENDLIST')))) {
          active.touched = Date.now();
          res.status(201).json({ id: active.id, url: `/api/playback/${active.id}/stream.m3u8`, qualities: levels.map(level => ({ height: level.height, url: `/api/playback/${active.id}/quality${level.height}.m3u8` })) });
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const message = active.failure ?? 'Playback conversion timed out. Please retry.';
      await stop(active);
      if (!disconnected && !res.destroyed) res.status(502).json({ error: message });
    } catch {
      if (session) await stop(session);
      else if (directory) await rm(directory, { recursive: true, force: true });
      if (!disconnected && !res.destroyed) res.status(500).json({ error: 'Could not prepare playback.' });
    } finally { if (reserved) pendingStarts--; }
  });

  router.post('/:id/heartbeat', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) { res.sendStatus(404); return; }
    session.touched = Date.now();
    res.sendStatus(204);
  });

  // POST also supports sendBeacon when the user closes the browser tab.
  router.post('/:id/stop', async (req, res) => {
    const session = sessions.get(req.params.id);
    if (session) await stop(session);
    res.sendStatus(204);
  });

  router.get('/:id/:file', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) { res.sendStatus(404); return; }
    if (!/^(stream\.m3u8|quality\d+\.m3u8|segment\d+\.ts|quality\d+_\d+\.ts)$/.test(req.params.file)) { res.sendStatus(404); return; }
    if (session.failure) { res.status(502).json({ error: session.failure }); return; }
    session.touched = Date.now();
    res.setHeader('Cache-Control', req.params.file.endsWith('.ts') ? 'private, max-age=120, immutable' : 'no-store');
    res.type(req.params.file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t');
    res.sendFile(path.join(session.directory, req.params.file), error => {
      if (error && !res.headersSent) res.sendStatus(404);
    });
  });

  return {
    router,
    async dispose() {
      disposed = true;
      clearInterval(reaper);
      await Promise.all([...probes].map(kill));
      await Promise.all([...sessions.values()].map(stop));
    },
  };
}
