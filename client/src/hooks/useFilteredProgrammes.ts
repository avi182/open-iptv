import { useMemo } from 'react';
import type { Channel, Programme } from '../types';

export interface FilterOptions {
  searchQuery: string;
  selectedDay: number | null; // null = all days, 0 = today, -1 = yesterday, etc.
  selectedGroup: string; // '' = all
  selectedChannel: string; // '' = all
  liveOnly: boolean;
}

interface SearchIndex {
  titleLower: string;
  descLower: string;
}

function getDayBounds(dayOffset: number): { start: number; end: number } {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
  const start = Math.floor(day.getTime() / 1000);
  const end = start + 86400;
  return { start, end };
}

export function useSearchIndex(programmes: Programme[]): SearchIndex[] {
  return useMemo(
    () => programmes.map((p) => ({
      titleLower: p.title.toLowerCase(),
      descLower: p.description.toLowerCase(),
    })),
    [programmes]
  );
}

export function useFilteredProgrammes(
  programmes: Programme[],
  searchIndex: SearchIndex[],
  channels: Channel[],
  filters: FilterOptions
): Programme[] {
  return useMemo(() => {
    let results: number[] = []; // indices into programmes array

    // Start with all indices
    for (let i = 0; i < programmes.length; i++) results.push(i);

    // Filter by day
    if (filters.selectedDay !== null) {
      const { start: dayStart, end: dayEnd } = getDayBounds(filters.selectedDay);
      results = results.filter((i) => programmes[i].start < dayEnd && programmes[i].stop > dayStart);
    }

    // Filter by channel group
    if (filters.selectedGroup) {
      const groupChannelIds = new Set(
        channels.filter((c) => c.group === filters.selectedGroup).map((c) => c.id)
      );
      results = results.filter((i) => groupChannelIds.has(programmes[i].channelId));
    }

    // Filter by selected channel
    if (filters.selectedChannel) {
      results = results.filter((i) => programmes[i].channelId === filters.selectedChannel);
    }

    // Filter to live only
    if (filters.liveOnly) {
      const now = Math.floor(Date.now() / 1000);
      results = results.filter((i) => programmes[i].start <= now && programmes[i].stop > now);
    }

    // Filter by search query using pre-computed lowercase index
    if (filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase();
      const matchingChannelIds = new Set(
        channels.filter((c) => c.name.toLowerCase().includes(query)).map((c) => c.id)
      );
      results = results.filter((i) =>
        searchIndex[i].titleLower.includes(query) ||
        searchIndex[i].descLower.includes(query) ||
        matchingChannelIds.has(programmes[i].channelId)
      );
    }

    // Sort: live-only by channel order (matching sidebar), otherwise by start time
    if (filters.liveOnly) {
      const channelOrder = new Map(channels.map((c, idx) => [c.id, idx]));
      results.sort((a, b) =>
        (channelOrder.get(programmes[a].channelId) ?? Infinity) - (channelOrder.get(programmes[b].channelId) ?? Infinity)
      );
    } else if (filters.selectedDay === null) {
      results.sort((a, b) => programmes[b].start - programmes[a].start);
    } else {
      results.sort((a, b) => programmes[a].start - programmes[b].start);
    }

    return results.map((i) => programmes[i]);
  }, [programmes, searchIndex, channels, filters.searchQuery, filters.selectedDay, filters.selectedGroup, filters.selectedChannel, filters.liveOnly]);
}

export function getUniqueGroups(channels: Channel[]): string[] {
  const groups = new Set(channels.map((c) => c.group).filter(Boolean));
  return Array.from(groups).sort();
}
