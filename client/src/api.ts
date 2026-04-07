import type { Channel, Programme } from './types';

export async function fetchChannels(playlistUrl: string): Promise<{ channels: Channel[]; epgUrl: string }> {
  const res = await fetch(`/api/playlist?url=${encodeURIComponent(playlistUrl)}`);
  if (!res.ok) throw new Error('Failed to fetch playlist');
  const data = await res.json();
  return { channels: data.channels, epgUrl: data.epgUrl };
}

export async function fetchProgrammes(playlistUrl: string): Promise<Programme[]> {
  const res = await fetch(`/api/epg?playlistUrl=${encodeURIComponent(playlistUrl)}`);
  if (!res.ok) throw new Error('Failed to fetch EPG');
  const data = await res.json();
  return data.programmes;
}
