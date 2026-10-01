import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createPlaybackService } from '../playback.ts';

const exec = promisify(execFile);
let directory: string;
let server: Server;
let base: string;
const service = createPlaybackService({ maxSessions: 1 });
const expiring = createPlaybackService({ idleMs: 500 });
const unavailable = createPlaybackService({ ffmpeg: '/nonexistent/ffmpeg' });

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'openiptv-test-'));
  await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=50',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '8',
    '-vf', 'tinterlace=interleave_top', '-flags', '+ilme+ildct', '-c:v', 'libx264',
    '-preset', 'ultrafast', '-c:a', 'aac', path.join(directory, 'interlaced.mp4')]);
  await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '10', '-c:v', 'libx264',
    '-preset', 'ultrafast', '-c:a', 'aac', path.join(directory, 'adaptive.mp4')]);
  const app = express();
  app.use(express.json());
  app.use('/fixture', express.static(directory));
  app.use('/api/playback', service.router);
  app.use('/missing', unavailable.router);
  app.use('/expiring', expiring.router);
  server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await service.dispose();
  await unavailable.dispose();
  await expiring.dispose();
  await new Promise<void>(resolve => server?.close(() => resolve()));
  await rm(directory, { recursive: true, force: true });
});

const start = (body: object, endpoint = '/api/playback') => fetch(base + endpoint, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('rejects non-HTTP inputs and invalid durations before spawning a converter', async () => {
  assert.equal((await start({ url: 'file:///etc/passwd' })).status, 400);
  assert.equal((await start({ url: `${base}/fixture/interlaced.mp4`, duration: -1 })).status, 400);
  assert.equal((await start({ url: `${base}/fixture/interlaced.mp4`, adaptive: 'yes' })).status, 400);
  assert.equal((await fetch(`${base}/api/playback/inspect?url=not-a-url`)).status, 400);
});

test('adaptive playback produces aligned, independently decodable renditions with a startup buffer', async () => {
  const response = await start({ url: `${base}/fixture/adaptive.mp4`, adaptive: true, duration: 10 });
  assert.equal(response.status, 201);
  const session = await response.json();
  try {
    assert.deepEqual(session.qualities.map((quality: { height: number }) => quality.height), [240, 360, 480, 720]);
    const master = await (await fetch(base + session.url)).text();
    assert.match(master, /#EXT-X-STREAM-INF/);
    const starts: number[] = [];
    for (const quality of session.qualities) {
      const playlist = await (await fetch(base + quality.url)).text();
      assert.ok((playlist.match(/#EXTINF:/g) || []).length >= 4, 'at least eight seconds ready before playback starts');
      const segment = playlist.split('\n').find(line => line.endsWith('.ts'))!;
      const segmentResponse = await fetch(`${base}/api/playback/${session.id}/${segment}`);
      assert.equal(segmentResponse.status, 200);
      assert.match(segmentResponse.headers.get('cache-control')!, /private/);
      const { writeFile } = await import('node:fs/promises');
      const output = path.join(directory, `quality${quality.height}.ts`);
      await writeFile(output, Buffer.from(await segmentResponse.arrayBuffer()));
      const probe = await exec('ffprobe', ['-v', 'quiet', '-show_streams', '-show_frames', '-of', 'json', output]);
      const media = JSON.parse(probe.stdout);
      const video = media.streams.find((stream: { codec_type: string }) => stream.codec_type === 'video');
      assert.equal(video.height, quality.height);
      assert.ok(media.streams.some((stream: { codec_name: string }) => stream.codec_name === 'aac'));
      const frame = media.frames.find((frame: { media_type: string }) => frame.media_type === 'video');
      assert.equal(frame.key_frame, 1, 'each rendition starts with a switchable keyframe');
      starts.push(Number(frame.pts_time));
    }
    assert.ok(Math.max(...starts) - Math.min(...starts) < 0.05, 'quality levels share the same timeline');
  } finally { await fetch(`${base}/api/playback/${session.id}/stop`, { method: 'POST' }); }
});

test('detects real interlaced frames and converts video plus audio to playable HLS', async () => {
  const url = `${base}/fixture/interlaced.mp4`;
  const inspected = await fetch(`${base}/api/playback/inspect?url=${encodeURIComponent(url)}`);
  assert.equal(inspected.status, 200);
  assert.equal((await inspected.json()).interlaced, true);
  const response = await start({ url, duration: 6 });
  assert.equal(response.status, 201);
  const session = await response.json();
  try {
    const playlist = await (await fetch(base + session.url)).text();
    assert.match(playlist, /#EXTINF:/);
    assert.doesNotMatch(playlist, /127\.0\.0\.1/);
    const segment = playlist.split('\n').find(line => line.endsWith('.ts'))!;
    const segmentResponse = await fetch(`${base}/api/playback/${session.id}/${segment}`);
    assert.equal(segmentResponse.status, 200);
    const { writeFile } = await import('node:fs/promises');
    const output = path.join(directory, 'converted.ts');
    await writeFile(output, Buffer.from(await segmentResponse.arrayBuffer()));
    const probe = await exec('ffprobe', ['-v', 'quiet', '-show_streams', '-show_frames', '-of', 'json', output]);
    const media = JSON.parse(probe.stdout);
    assert.ok(media.streams.some((s: { codec_name: string }) => s.codec_name === 'h264'));
    assert.ok(media.streams.some((s: { codec_name: string }) => s.codec_name === 'aac'));
    const frames = media.frames.filter((f: { media_type: string }) => f.media_type === 'video');
    assert.ok(frames.length >= 20);
    assert.ok(frames.every((f: { interlaced_frame: number }) => f.interlaced_frame === 0));
    assert.equal((await start({ url })).status, 503, 'concurrent converters are bounded');
    assert.equal((await fetch(`${base}/api/playback/${session.id}/heartbeat`, { method: 'POST' })).status, 204);
    assert.equal((await fetch(`${base}/api/playback/${session.id}/secret.txt`)).status, 404);
  } finally {
    assert.equal((await fetch(`${base}/api/playback/${session.id}/stop`, { method: 'POST' })).status, 204);
  }
  assert.equal((await fetch(base + session.url)).status, 404, 'closed sessions cannot continue streaming');
});

test('reports missing ffmpeg without hanging or leaking a playback session', async () => {
  const response = await start({ url: `${base}/fixture/interlaced.mp4` }, '/missing');
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /ffmpeg/);
});

test('disconnecting during startup releases the converter slot', async () => {
  const controller = new AbortController();
  const request = fetch(base + '/api/playback', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `${base}/fixture/interlaced.mp4` }), signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 300);
  await assert.rejects(request, { name: 'AbortError' });
  // Wait for the process cleanup rather than starting another CPU-intensive conversion.
  await new Promise(resolve => setTimeout(resolve, 300));
  const probe = await start({ url: `${base}/fixture/missing.mp4` });
  assert.equal(probe.status, 502, 'the slot is free; the missing source fails instead of returning busy');
});


test('abandoned sessions expire and remove their stream files', async () => {
  const response = await start({ url: `${base}/fixture/interlaced.mp4` }, '/expiring');
  assert.equal(response.status, 201);
  const { id } = await response.json();
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal((await fetch(`${base}/expiring/${id}/stream.m3u8`)).status, 404);
});
