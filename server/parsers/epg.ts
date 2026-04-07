import { gunzipSync } from 'zlib';
import { XMLParser } from 'fast-xml-parser';
import type { Programme } from '../types.js';

function extractText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return extractText(value[0]);
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    return extractText(obj['#text'] ?? '');
  }
  return String(value);
}

function parseXmltvTime(timeStr: string): number {
  // Format: "20260208111000 +0300"
  const match = timeStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})$/);
  if (!match) return 0;

  const [, year, month, day, hour, min, sec, tz] = match;
  const tzSign = tz[0] === '+' ? -1 : 1;
  const tzHours = parseInt(tz.slice(1, 3), 10);
  const tzMins = parseInt(tz.slice(3, 5), 10);
  const tzOffsetMs = tzSign * (tzHours * 60 + tzMins) * 60 * 1000;

  const utcMs = Date.UTC(
    parseInt(year), parseInt(month) - 1, parseInt(day),
    parseInt(hour), parseInt(min), parseInt(sec)
  ) + tzOffsetMs;

  return Math.floor(utcMs / 1000);
}

function isGzipped(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

export async function fetchAndParseEpg(
  url: string,
  validChannelIds: Set<string>
): Promise<Programme[]> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`EPG fetch failed: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const xml = isGzipped(buffer)
    ? gunzipSync(buffer).toString('utf-8')
    : buffer.toString('utf-8');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  const parsed = parser.parse(xml);

  const rawProgrammes = parsed?.tv?.programme;
  if (!Array.isArray(rawProgrammes)) return [];

  const programmes: Programme[] = [];

  for (const p of rawProgrammes) {
    const channelId = p['@_channel'];
    if (!validChannelIds.has(channelId)) continue;

    const start = parseXmltvTime(p['@_start'] || '');
    const stop = parseXmltvTime(p['@_stop'] || '');
    if (!start || !stop) continue;

    const title = extractText(p.title) || 'Untitled';
    const description = extractText(p.desc);

    programmes.push({
      id: `${channelId}-${start}`,
      channelId,
      title,
      description,
      start,
      stop,
    });
  }

  return programmes;
}
