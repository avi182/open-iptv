import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveSeekTarget, archiveSource, createPlayback, formatPlaybackTime, getWatchingProgramme, seekTarget } from '../src/utils/playback.ts';

const now = 2_000_000;
const channel = { id: '1', name: 'Test', logo: '', group: '', streamUrl: 'https://example.com/live.m3u8?token=abc', catchupDays: 7 };
const programme = { id: 'p', channelId: '1', title: 'Show', description: '', start: now - 3600, stop: now - 1800 };

test('channel and live selections keep the original stream URL', () => {
  assert.equal(createPlayback(channel, undefined, now)?.url, channel.streamUrl);
  const live = createPlayback(channel, { ...programme, stop: now + 1800 }, now);
  assert.equal(live?.live, true);
  assert.equal(live?.url, channel.streamUrl);
});

test('catch-up builds the archive URL and preserves provider query parameters', () => {
  const archive = createPlayback(channel, programme, now);
  assert.equal(archive?.live, false);
  assert.equal(archive?.url, `${channel.streamUrl}&utc=${programme.start}&lutc=${now}`);
});

test('future, expired, unavailable archives and empty streams cannot start', () => {
  assert.equal(createPlayback(channel, { ...programme, start: now + 60, stop: now + 120 }, now), null);
  assert.equal(createPlayback(channel, { ...programme, start: now - 8 * 86400 }, now), null);
  assert.equal(createPlayback({ ...channel, catchupDays: 0 }, programme, now), null);
  assert.equal(createPlayback({ ...channel, streamUrl: '' }, undefined, now), null);
});

const ranges = (values: number[][]) => ({ length: values.length, start: (i: number) => values[i][0], end: (i: number) => values[i][1] });
test('seeking clamps to the moving DVR window and skips unplayable gaps', () => {
  const window = ranges([[100, 150], [160, 200]]);
  assert.equal(seekTarget(window, 50), 100);
  assert.equal(seekTarget(window, 125), 125);
  assert.equal(seekTarget(window, 155), 160);
  assert.equal(seekTarget(window, 999), 199.9);
  assert.equal(seekTarget(ranges([]), 0), null);
  assert.equal(seekTarget(window, Infinity), null);
});

test('playback times handle hours and unknown durations', () => {
  assert.equal(formatPlaybackTime(3661), '1:01:01');
  assert.equal(formatPlaybackTime(65.8), '1:05');
  assert.equal(formatPlaybackTime(Infinity), '0:00');
  assert.equal(formatPlaybackTime(-1), '0:00');
});

test('archive seeks reopen at the programme offset and convert only the remaining duration', () => {
  const playback = createPlayback(channel, programme, now)!;
  const middle = archiveSource(playback, 900.8);
  const url = new URL(middle.url);
  assert.equal(url.searchParams.get('utc'), String(programme.start + 900));
  assert.equal(url.searchParams.get('lutc'), String(now));
  assert.equal(url.searchParams.get('token'), 'abc');
  assert.equal(url.searchParams.getAll('utc').length, 1);
  assert.equal(middle.duration, 900);
  assert.equal(archiveSource(playback, -10).duration, 1800);
  assert.equal(archiveSource(playback, 9999).duration, 1);
});

test('archive seeking preserves programme time and reloads outside the available window', () => {
  const available = ranges([[10, 40], [45, 60]]);
  assert.equal(archiveSeekTarget(available, 910, 900, 10), 20);
  assert.equal(archiveSeekTarget(available, 0, 900, 10), null, 'rewind must reopen evicted content');
  assert.equal(archiveSeekTarget(available, 1500, 900, 10), null, 'forward seek must not clamp to buffered content');
  assert.equal(archiveSeekTarget(available, 932, 900, 10), null, 'gaps require a fresh archive request');
  assert.equal(archiveSeekTarget(ranges([]), 900, 900, 0), null, 'seeking is possible before media loads');
});


test('live guide changes at programme boundaries and leaves gaps unlabelled', () => {
  const first = { ...programme, id: 'first', start: now - 60, stop: now };
  const next = { ...programme, id: 'next', start: now, stop: now + 60 };
  const otherChannel = { ...next, channelId: 'other' };
  const live = createPlayback(channel, first, now - 30)!;
  assert.equal(getWatchingProgramme(live, [otherChannel, first, next], now - 1)?.id, 'first');
  assert.equal(getWatchingProgramme(live, [otherChannel, first, next], now)?.id, 'next');
  assert.equal(getWatchingProgramme(live, [first, next], now + 60), undefined);
  assert.equal(live.url, channel.streamUrl);
});

test('catch-up guide highlights the watched archive rather than the live programme', () => {
  const archive = createPlayback(channel, programme, now)!;
  const live = { ...programme, id: 'live', start: now - 60, stop: now + 60 };
  assert.equal(getWatchingProgramme(archive, [programme, live], now)?.id, programme.id);
  assert.equal(getWatchingProgramme(archive, [], now)?.id, programme.id);
});
