import type { Channel } from '../types.js';

export interface M3UResult {
  channels: Channel[];
  epgUrl: string;
}

export function parseM3U(content: string): M3UResult {
  const channels: Channel[] = [];
  const lines = content.split('\n');

  // Extract EPG URL from the #EXTM3U header line
  let epgUrl = '';
  const firstLine = lines[0]?.trim() ?? '';
  if (firstLine.startsWith('#EXTM3U')) {
    const tvgMatch = firstLine.match(/url-tvg="([^"]*)"/);
    if (tvgMatch) {
      epgUrl = tvgMatch[1];
    }
  }

  let current: Partial<Channel> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('#EXTINF:')) {
      current = {};

      const groupMatch = trimmed.match(/group-title="([^"]*)"/);
      const idMatch = trimmed.match(/tvg-id="([^"]*)"/);
      const logoMatch = trimmed.match(/tvg-logo="([^"]*)"/);
      const catchupMatch = trimmed.match(/catchup-days="([^"]*)"/);

      // Channel name is after the last comma
      const nameMatch = trimmed.match(/,(.+)$/);

      current.group = groupMatch?.[1] ?? '';
      current.id = idMatch?.[1] ?? '';
      current.logo = logoMatch?.[1] ?? '';
      current.catchupDays = parseInt(catchupMatch?.[1] ?? '0', 10);
      current.name = nameMatch?.[1]?.trim() ?? '';
    } else if (current && trimmed.startsWith('http')) {
      current.streamUrl = trimmed;
      if (current.id && current.name) {
        channels.push(current as Channel);
      }
      current = null;
    }
  }

  return { channels, epgUrl };
}
