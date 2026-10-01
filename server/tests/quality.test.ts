import { test } from 'node:test';
import assert from 'node:assert/strict';
import { masterPlaylist, renditionsFor } from '../quality.ts';

test('adaptive ladder preserves aspect ratio, uses even sizes and never upscales', () => {
  assert.deepEqual(renditionsFor(1920, 1080).map(level => level.height), [240, 360, 480, 720, 1080]);
  assert.deepEqual(renditionsFor(320, 180).map(level => [level.width, level.height]), [[320, 180]]);
  assert.deepEqual(renditionsFor(720, 576).map(level => level.height), [240, 360, 480, 576]);
  assert.ok(renditionsFor(1280, 720).every(level => level.width % 2 === 0 && level.height <= 720));
});

test('master playlist advertises bandwidth including audio and relative variant URLs', () => {
  const playlist = masterPlaylist(renditionsFor(1920, 1080));
  assert.equal((playlist.match(/#EXT-X-STREAM-INF/g) || []).length, 5);
  const highest = playlist.split('\n').find(line => line.includes('RESOLUTION=1920x1080'))!;
  assert.ok(Number(highest.match(/BANDWIDTH=(\d+)/)![1]) > 3_500_000 + 96_000);
  assert.match(playlist, /quality240.m3u8/);
  assert.doesNotMatch(playlist, /https?:/);
});
