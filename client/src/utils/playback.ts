import type { Channel, Programme } from '../types';
import { buildStreamUrl, getProgrammeStatus } from './catchup';

export interface Playback {
  channel: Channel;
  programme?: Programme;
  url: string;
  live: boolean;
}

export function createPlayback(channel: Channel, programme?: Programme, now = Math.floor(Date.now() / 1000)): Playback | null {
  if (!channel.streamUrl) return null;
  if (!programme) return { channel, url: channel.streamUrl, live: true };
  const status = getProgrammeStatus(programme, now);
  if (status === 'future') return null;
  if (status === 'past' && (channel.catchupDays <= 0 || programme.start < now - channel.catchupDays * 86400)) return null;
  return { channel, programme, url: buildStreamUrl(channel.streamUrl, programme, now), live: status === 'live' };
}

export function formatPlaybackTime(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const rest = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

// Seek only inside ranges the browser reports as playable (including a live DVR window).
export function seekTarget(ranges: TimeRanges, target: number): number | null {
  if (!ranges.length || !Number.isFinite(target)) return null;
  for (let i = 0; i < ranges.length; i++) {
    if (target < ranges.start(i)) return ranges.start(i);
    if (target <= ranges.end(i)) return Math.max(ranges.start(i), Math.min(target, ranges.end(i) - 0.1));
  }
  return Math.max(ranges.start(ranges.length - 1), ranges.end(ranges.length - 1) - 0.1);
}

// Archive playlists may expose only a small, moving window. Reopen the archive
// at the requested programme offset when the browser cannot seek there itself.
export function archiveSource(playback: Playback, offset: number): { url: string; duration: number } {
  const programme = playback.programme!;
  const duration = programme.stop - programme.start;
  const position = Math.max(0, Math.min(Math.floor(offset), duration - 1));
  const url = new URL(playback.url);
  url.searchParams.set('utc', String(programme.start + position));
  return { url: url.toString(), duration: duration - position };
}

export function archiveSeekTarget(ranges: TimeRanges, position: number, offset: number, origin: number): number | null {
  const target = position - offset + origin;
  for (let i = 0; i < ranges.length; i++) {
    if (target >= ranges.start(i) && target < ranges.end(i) - 0.1) return target;
  }
  return null;
}

// Live EPG metadata follows the clock; archive playback stays on the chosen show.
// Keep this separate from the stream source so a programme boundary never reloads it.
export function getWatchingProgramme(playback: Playback, schedule: Programme[], now: number): Programme | undefined {
  if (!playback.live) return playback.programme;
  return schedule.find(programme => programme.channelId === playback.channel.id && programme.start <= now && now < programme.stop);
}
