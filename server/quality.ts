export interface Rendition { height: number; width: number; bitrate: number }

const ladder = [
  { height: 240, bitrate: 300_000 },
  { height: 360, bitrate: 550_000 },
  { height: 480, bitrate: 900_000 },
  { height: 720, bitrate: 1_800_000 },
  { height: 1080, bitrate: 3_500_000 },
];

export function renditionsFor(width: number, height: number): Rendition[] {
  const maximum = Math.min(1080, Math.floor(height / 2) * 2);
  const heights = [...new Set([...ladder.filter(level => level.height <= maximum).map(level => level.height), maximum])];
  return heights.map(outputHeight => ({
    height: outputHeight,
    width: Math.max(2, Math.round(width / height * outputHeight / 2) * 2),
    bitrate: ladder.find(level => level.height >= outputHeight)!.bitrate,
  }));
}

export function masterPlaylist(levels: Rendition[]): string {
  return '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n' + levels.map(level =>
    `#EXT-X-STREAM-INF:BANDWIDTH=${Math.ceil((level.bitrate * 1.2 + 96000) * 1.15)},AVERAGE-BANDWIDTH=${Math.ceil((level.bitrate + 96000) * 1.1)},RESOLUTION=${level.width}x${level.height}\nquality${level.height}.m3u8\n`,
  ).join('');
}

export function adaptiveOutputs(levels: Rendition[], directory: string, duration?: number, encoder = 'libx264'): string[] {
  const outputs = levels.map((_, index) => `[scaled${index}]`).join('');
  const filters = [`[0:v:0]yadif=mode=send_frame:parity=auto:deint=interlaced,split=${levels.length}${outputs}`,
    ...levels.map((level, index) => `[scaled${index}]scale=${level.width}:${level.height},setsar=1[out${index}]`)];
  return ['-filter_complex_threads', '1', '-filter_complex', filters.join(';'), ...levels.flatMap((level, index) => [
    '-map', `[out${index}]`, '-map', '0:a:0?', ...(duration ? ['-t', String(duration)] : []), '-sn', '-dn',
    '-c:v', encoder,
    ...(encoder === 'h264_videotoolbox' ? ['-realtime', '1', '-allow_sw', '1'] : ['-threads', '2', '-preset', 'superfast', '-tune', 'zerolatency']),
    '-profile:v', 'main', '-bf', '0',
    '-b:v', String(level.bitrate), '-maxrate', String(Math.round(level.bitrate * 1.2)), '-bufsize', String(level.bitrate * 2),
    '-pix_fmt', 'yuv420p', '-force_key_frames', 'expr:gte(t,n_forced*2)', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-ar', '48000',
    '-f', 'hls', '-hls_time', '2', '-hls_list_size', '60',
    '-hls_flags', 'delete_segments+independent_segments+temp_file',
    '-hls_segment_filename', `${directory}/quality${level.height}_%06d.ts`, `${directory}/quality${level.height}.m3u8`,
  ])];
}
