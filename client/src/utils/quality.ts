export type Quality = 'auto' | 'original' | `${number}`;

export function savedQuality(): Quality {
  try {
    const value = localStorage.getItem('openiptv-player-quality');
    if (value === 'original' || value === 'auto' || (value && /^\d+$/.test(value) && Number(value) >= 2 && Number(value) <= 1080)) return value as Quality;
  } catch { /* Private browsing may disable storage. */ }
  return 'auto';
}

// Use the nearest available resolution at or below the requested ceiling.
export function qualityLevel(levels: { height: number }[], quality: Quality): number {
  if (quality === 'auto' || quality === 'original' || !levels.length) return -1;
  let selected = levels.reduce((lowest, level, index) => level.height < levels[lowest].height ? index : lowest, 0);
  for (let index = 0; index < levels.length; index++) {
    if (levels[index].height <= Number(quality) && (levels[selected].height > Number(quality) || levels[index].height > levels[selected].height)) selected = index;
  }
  return selected;
}
