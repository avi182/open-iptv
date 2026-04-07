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
