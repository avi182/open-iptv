import type { Programme } from '../types';

export function buildStreamUrl(baseStreamUrl: string, programme: Programme): string {
  const now = Math.floor(Date.now() / 1000);
  const isPast = programme.stop < now;

  if (isPast) {
    const separator = baseStreamUrl.includes('?') ? '&' : '?';
    return `${baseStreamUrl}${separator}utc=${programme.start}&lutc=${now}`;
  }

  // Live or future - just the base URL
  return baseStreamUrl;
}

export function getProgrammeStatus(programme: Programme): 'past' | 'live' | 'future' {
  const now = Math.floor(Date.now() / 1000);
  if (programme.stop < now) return 'past';
  if (programme.start <= now && programme.stop >= now) return 'live';
  return 'future';
}


export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export async function openInVLC(url: string): Promise<void> {
  const res = await fetch(`/api/open-vlc?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(error || 'Failed to open VLC');
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function getProgrammeDuration(programme: Programme): number {
  const now = Math.floor(Date.now() / 1000);
  if (programme.stop <= now) return programme.stop - programme.start;
  if (programme.start <= now) return programme.stop - now;
  return programme.stop - programme.start;
}

export async function probeStream(streamUrl: string, duration: number): Promise<number> {
  const params = new URLSearchParams({
    url: streamUrl,
    duration: String(duration),
  });
  const res = await fetch(`/api/probe?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to probe');
  const data = await res.json();
  return data.estimatedBytes;
}

export function downloadStream(streamUrl: string, programme: Programme, channelName?: string): void {
  const now = Math.floor(Date.now() / 1000);

  let duration: number;
  if (programme.stop <= now) {
    duration = programme.stop - programme.start;
  } else if (programme.start <= now) {
    duration = programme.stop - now;
  } else {
    duration = programme.stop - programme.start;
  }

  const dateStr = new Date(programme.start * 1000).toISOString().slice(0, 10);
  const titleSlug = programme.title
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
  const prefix = channelName
    ? channelName.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_')
    : 'programme';
  const filename = `${prefix}_${titleSlug}_${dateStr}.mp4`;

  const params = new URLSearchParams({
    url: streamUrl,
    duration: String(duration),
    filename,
  });

  const a = document.createElement('a');
  a.href = `/api/download?${params.toString()}`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
