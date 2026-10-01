import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Hls from 'hls.js';
import type { Programme } from '../types';
import { archiveSeekTarget, archiveSource, formatPlaybackTime, seekTarget, type Playback } from '../utils/playback';
import { qualityLevel, savedQuality, type Quality } from '../utils/quality';
import './VideoPlayer.css';

function savedAudio() {
  try {
    const saved = JSON.parse(localStorage.getItem('openiptv-player-audio') || '{}');
    return { volume: typeof saved.volume === 'number' ? Math.max(0, Math.min(1, saved.volume)) : 1, muted: saved.muted === true };
  } catch { return { volume: 1, muted: false }; }
}

type SafariVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

function Icon({ name }: { name: 'play' | 'pause' | 'volume' | 'muted' | 'fullscreen' | 'pip' | 'close' }) {
  const paths = {
    play: 'M8 5v14l11-7z', pause: 'M7 5h3v14H7zM14 5h3v14h-3z',
    volume: 'M11 4 6 8H3v8h3l5 4V4m4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
    muted: 'M11 4 6 8H3v8h3l5 4V4m5 5 6 6m0-6-6 6',
    fullscreen: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
    pip: 'M3 3h18v18H3zM11 11h8v8h-8z', close: 'm6 6 12 12M6 18 18 6',
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill={name === 'play' || name === 'pause' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

export default function VideoPlayer({ playback, currentProgramme, onClose }: { playback: Playback; currentProgramme?: Programme; onClose: () => void }) {
  const displayProgramme = playback.live ? currentProgramme : playback.programme;
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const archiveDuration = !playback.live && playback.programme ? playback.programme.stop - playback.programme.start : 0;
  const [sourceOffset, setSourceOffset] = useState(0);
  const sourceClock = useRef<{ offset: number; origin: number | null }>({ offset: 0, origin: null });
  const needsConversion = useRef(false);
  const stopSession = useRef(Promise.resolve());
  const wantsPlay = useRef(true);
  const playbackRate = useRef(1);
  const dragging = useRef(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [paused, setPaused] = useState(true);
  const [waiting, setWaiting] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [audio] = useState(savedAudio);
  const [volume, setVolume] = useState(audio.volume);
  const [muted, setMuted] = useState(audio.muted);
  const [current, setCurrent] = useState(0);
  const [liveRange, setLiveRange] = useState({ start: 0, end: 0 });
  const range = playback.live ? liveRange : { start: 0, end: archiveDuration };
  const [buffered, setBuffered] = useState(0);
  const [visible, setVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [pip, setPip] = useState(false);
  const [failedLogo, setFailedLogo] = useState<string>();
  const [quality, setQuality] = useState<Quality>(savedQuality);
  const qualityRef = useRef(quality);
  const [qualityHeights, setQualityHeights] = useState([240, 360, 480, 720, 1080]);
  const [activeHeight, setActiveHeight] = useState(0);
  const nativeQuality = useRef<((quality: Quality) => void) | null>(null);
  const adaptive = quality !== 'original';

  useEffect(() => {
    const video = videoRef.current!;
    const source = !playback.live && playback.programme ? archiveSource(playback, sourceOffset) : { url: playback.url };
    sourceClock.current = { offset: sourceOffset, origin: null };
    const preferences = savedAudio();
    video.volume = preferences.volume;
    video.muted = preferences.muted;
    const requests = new AbortController();
    const inspection = new AbortController();
    let disposed = false;
    let recovered = false;
    let converting = false;
    let converted = false;
    let generation = 0;
    let sessionId: string | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let resumeMediaTime: number | null = null;

    function releaseSession() {
      clearInterval(heartbeat);
      if (sessionId) {
        stopSession.current = fetch(`/api/playback/${sessionId}/stop`, { method: 'POST', keepalive: true }).then(() => {}, () => {});
        sessionId = undefined;
      }
    }

    function clearSource() {
      generation++;
      clearTimeout(timeout);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      nativeQuality.current = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
    }

    function terminalError(message = 'This stream could not be played. It may be offline or unavailable.') {
      if (disposed) return;
      clearTimeout(timeout);
      setWaiting(false);
      setNotice('');
      setError(message);
      hlsRef.current?.stopLoad();
      video.pause();
      releaseSession();
    }

    async function convert() {
      if (disposed || converted || converting) return;
      converting = true;
      needsConversion.current = true;
      inspection.abort();
      clearSource();
      setError('');
      setWaiting(true);
      setNotice('Preparing this channel for playback…');
      try {
        await stopSession.current;
        if (disposed) return;
        const response = await fetch('/api/playback', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: requests.signal,
          body: JSON.stringify({ ...source, adaptive }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not prepare playback.');
        sessionId = data.id;
        if (disposed) { releaseSession(); return; }
        converting = false;
        converted = true;
        setNotice('');
        heartbeat = setInterval(() => {
          void fetch(`/api/playback/${sessionId}/heartbeat`, { method: 'POST', signal: requests.signal })
            .then(response => { if (!response.ok && !disposed) terminalError('The playback session ended. Retry to reconnect.'); })
            .catch(() => {});
        }, 15_000);
        if (adaptive) setQualityHeights(data.qualities.map((level: { height: number }) => level.height));
        attachSource(data.url, true, data.qualities);
      } catch (error) {
        if (!disposed) {
          converting = false;
          terminalError(error instanceof Error ? error.message : 'Could not prepare playback.');
        }
      }
    }

    function fail() {
      if (disposed || converting) return;
      if (!converted) void convert();
      else terminalError();
    }

    function watchdog() {
      clearTimeout(timeout);
      if (!converting) timeout = setTimeout(fail, converted ? 25000 : 12000);
    }

    function play() {
      if (disposed || converting) return;
      video.playbackRate = playbackRate.current;
      if (!wantsPlay.current) { clearTimeout(timeout); setWaiting(false); return; }
      const currentGeneration = generation;
      void video.play().catch((error: DOMException) => {
        if (disposed || currentGeneration !== generation || error.name === 'AbortError') return;
        if (error.name === 'NotAllowedError') {
          clearTimeout(timeout);
          setWaiting(false);
          setNotice('Press play to start watching.');
        } else fail();
      });
    }

    function attachSource(url: string, localHls = false, qualities: { height: number; url: string }[] = []) {
      if (disposed) return;
      sourceClock.current = { offset: sourceOffset, origin: null };
      const directMedia = /\.(mp4|m4v|webm|ogv|ogg|mov)(?:[?#]|$)/i.test(url);
      if (!directMedia && Hls.isSupported() && (localHls || !video.canPlayType('application/vnd.apple.mpegurl'))) {
        const hls = new Hls({
          maxBufferLength: 45, maxMaxBufferLength: 90, backBufferLength: 60,
          lowLatencyMode: false, liveSyncDurationCount: 5, liveMaxLatencyDurationCount: 15,
          abrEwmaDefaultEstimate: 500_000, abrBandWidthFactor: 0.7, abrBandWidthUpFactor: 0.6,
          ...(!playback.live ? { startPosition: 0 } : {}),
        });
        hlsRef.current = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (adaptive) {
            const level = qualityLevel(hls.levels, qualityRef.current);
            hls.startLevel = level < 0 ? 0 : level;
            hls.loadLevel = level;
          }
          play();
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => setActiveHeight(hls.levels[data.level]?.height ?? 0));
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || disposed || hlsRef.current !== hls) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
            recovered = true;
            hls.recoverMediaError();
          } else fail();
        });
        hls.loadSource(url);
        hls.attachMedia(video);
      } else {
        const level = qualityLevel(qualities, qualityRef.current);
        video.src = adaptive && level >= 0 ? qualities[level].url : url;
        nativeQuality.current = selection => {
          const next = qualityLevel(qualities, selection);
          const targetUrl = next >= 0 ? qualities[next].url : url;
          resumeMediaTime = playback.live ? null : video.currentTime;
          setWaiting(true);
          video.src = targetUrl;
          video.load();
          watchdog();
        };
        video.load();
        play();
      }
      watchdog();
    }

    const playing = () => {
      if (converting || disposed) return;
      clearTimeout(timeout);
      setWaiting(false);
      setError('');
      setNotice('');
    };
    const paused = () => { if (video.readyState >= 2) clearTimeout(timeout); };
    const syncPip = () => setPip(document.pictureInPictureElement === video);
    const onPageHide = () => { if (sessionId) navigator.sendBeacon(`/api/playback/${sessionId}/stop`); };
    window.addEventListener('pagehide', onPageHide);
    video.addEventListener('enterpictureinpicture', syncPip);
    video.addEventListener('leavepictureinpicture', syncPip);
    video.addEventListener('playing', playing);
    video.addEventListener('pause', paused);
    video.addEventListener('waiting', watchdog);
    video.addEventListener('error', fail);
    const restoreNativePosition = () => {
      if (resumeMediaTime !== null && video.readyState >= 1) {
        const position = seekTarget(video.seekable, resumeMediaTime);
        if (position === null) return;
        try {
          video.currentTime = position;
          resumeMediaTime = null;
        } catch { /* Retry once the native decoder reaches canplay. */ }
      }
    };
    const metadata = () => {
      if (resumeMediaTime !== null) restoreNativePosition();
      else if (!playback.live && video.seekable.length) video.currentTime = video.seekable.start(0);
      play();
    };
    video.addEventListener('canplay', restoreNativePosition);
    video.addEventListener('loadedmetadata', metadata);
    if (adaptive || needsConversion.current) void convert();
    else attachSource(source.url);
    // Inspect a few decoded frames: stream metadata often omits the interlace flag.
    // Direct playback proceeds in parallel, so progressive channels start immediately.
    if (!adaptive && !needsConversion.current) void fetch(`/api/playback/inspect?url=${encodeURIComponent(source.url)}`, { signal: inspection.signal })
      .then(async response => {
        if (response.ok && (await response.json()).interlaced && !disposed) await convert();
      }).catch(() => {});

    return () => {
      disposed = true;
      requests.abort();
      inspection.abort();
      window.removeEventListener('pagehide', onPageHide);
      video.removeEventListener('enterpictureinpicture', syncPip);
      video.removeEventListener('leavepictureinpicture', syncPip);
      video.removeEventListener('playing', playing);
      video.removeEventListener('pause', paused);
      video.removeEventListener('waiting', watchdog);
      video.removeEventListener('error', fail);
      video.removeEventListener('loadedmetadata', metadata);
      video.removeEventListener('canplay', restoreNativePosition);
      if (document.pictureInPictureElement === video) void document.exitPictureInPicture().catch(() => {});
      clearSource();
      releaseSession();
    };
  }, [playback, sourceOffset, attempt, adaptive]);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', sync);
    frameRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      clearTimeout(hideTimer.current);
    };
  }, []);

  function showControls() {
    setVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!frameRef.current?.querySelector('.player-controls')?.contains(document.activeElement)) setVisible(false);
    }, 3000);
  }

  function updateAudio() {
    const video = videoRef.current!;
    setVolume(video.volume);
    setMuted(video.muted);
    try { localStorage.setItem('openiptv-player-audio', JSON.stringify({ volume: video.volume, muted: video.muted })); } catch { /* Storage may be unavailable. */ }
  }

  function updateTimeline() {
    const video = videoRef.current!;
    const ranges = video.seekable;
    const clock = sourceClock.current;
    if (clock.origin === null) {
      if (ranges.length) clock.origin = ranges.start(0);
      else if (video.buffered.length) clock.origin = video.buffered.start(0);
      else return;
    }
    const offset = playback.live ? 0 : clock.offset - clock.origin;
    const position = Math.max(0, video.currentTime + offset);
    setCurrent(playback.live ? position : Math.min(archiveDuration, position));
    const playable = ranges.length ? ranges : video.buffered;
    if (playable.length) setLiveRange({ start: playable.start(0), end: playable.end(playable.length - 1) });
    setBuffered(video.buffered.length ? video.buffered.end(video.buffered.length - 1) + offset : clock.offset);
    if (!playback.live && position >= archiveDuration) {
      wantsPlay.current = false;
      video.pause();
      setWaiting(false);
    }
  }

  function seek(time: number) {
    const video = videoRef.current!;
    if (!Number.isFinite(time)) return;
    if (playback.live) {
      const target = seekTarget(video.seekable.length ? video.seekable : video.buffered, time);
      if (target !== null) video.currentTime = target;
    } else {
      const position = Math.max(0, Math.min(time, archiveDuration - 1));
      const clock = sourceClock.current;
      const target = clock.origin === null ? null : archiveSeekTarget(video.seekable, position, clock.offset, clock.origin);
      setCurrent(position);
      if (target !== null) video.currentTime = target;
      else {
        setWaiting(true);
        setBuffered(Math.floor(position));
        setSourceOffset(Math.floor(position));
        setAttempt(value => value + 1);
      }
    }
    setScrub(null);
    showControls();
  }

  function togglePlay() {
    const video = videoRef.current!;
    wantsPlay.current = video.paused;
    if (video.paused && !playback.live && current >= archiveDuration) seek(0);
    else if (video.paused) void video.play().catch(() => setNotice('Unable to start playback. Try again or retry the stream.'));
    else video.pause();
    showControls();
  }

  function changeQuality(selection: Quality) {
    const changingSource = (selection === 'original') !== (quality === 'original');
    qualityRef.current = selection;
    setQuality(selection);
    try { localStorage.setItem('openiptv-player-quality', selection); } catch { /* Storage may be unavailable. */ }
    if (changingSource) {
      if (!playback.live) setSourceOffset(Math.floor(current));
      needsConversion.current = false;
      setWaiting(true);
      setActiveHeight(0);
    } else if (hlsRef.current) {
      hlsRef.current.nextLevel = qualityLevel(hlsRef.current.levels, selection);
    } else if (nativeQuality.current) {
      if (!playback.live && !videoRef.current!.seekable.length) {
        // Some native HLS engines cannot seek after changing the source. Open
        // the archive at the programme position instead of silently restarting.
        setSourceOffset(Math.floor(current));
        setAttempt(value => value + 1);
        setWaiting(true);
      } else nativeQuality.current(selection);
    }
    showControls();
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (frameRef.current?.requestFullscreen) await frameRef.current.requestFullscreen();
      else (videoRef.current as SafariVideo)?.webkitEnterFullscreen?.();
    } catch { setNotice('Fullscreen is unavailable in this browser.'); }
  }

  async function togglePip() {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await videoRef.current?.requestPictureInPicture();
    } catch { setNotice('Picture-in-picture is unavailable right now.'); }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement).matches('input, select, button, a')) return;
    const video = videoRef.current!;
    switch (event.key.toLowerCase()) {
      case ' ': case 'k': togglePlay(); break;
      case 'm': video.muted = !video.muted; break;
      case 'f': void toggleFullscreen(); break;
      case 'arrowleft': seek(current - 5); break;
      case 'arrowright': seek(current + 5); break;
      case 'j': seek(current - 10); break;
      case 'l': seek(current + 10); break;
      case 'arrowup': video.volume = Math.min(1, video.volume + 0.05); break;
      case 'arrowdown': video.volume = Math.max(0, video.volume - 0.05); break;
      default: return;
    }
    event.preventDefault();
    showControls();
  }

  const span = range.end - range.start;
  const timelinePosition = scrub ?? current;
  const percent = (time: number) => span > 0 ? Math.max(0, Math.min(100, (time - range.start) / span * 100)) : 0;
  // Auto deliberately stays about ten seconds behind the edge for mobile jitter.
  const atLive = playback.live && span > 0 && range.end - current < 14;
  const controlsVisible = visible || paused || waiting || !!error;

  return (
    <section className="watch-player" aria-label={`Watching ${playback.channel.name}`}>
      <div className="watch-heading">
        <div className="watch-heading-info">
          <span className="watch-eyebrow">{playback.live ? 'NOW WATCHING' : 'CATCH-UP'}</span>
          {displayProgramme && <h2 dir="auto">{displayProgramme.title}</h2>}
          <div className="watch-channel">
            <span className="watch-channel-logo" aria-hidden="true">
              {playback.channel.logo && failedLogo !== playback.channel.logo
                ? <img src={playback.channel.logo} alt="" onError={() => setFailedLogo(playback.channel.logo)} />
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="13" rx="2" /><path d="M8 21h8M12 18v3" /></svg>}
            </span>
            {displayProgramme ? <span dir="auto">{playback.channel.name}</span> : <h2 dir="auto">{playback.channel.name}</h2>}
          </div>
          {!displayProgramme && <p dir="auto">{playback.channel.group}</p>}
        </div>
        <button className="player-icon-button" onClick={onClose} aria-label="Close player" title="Close player"><Icon name="close" /></button>
      </div>
      <div ref={frameRef} className={`player-frame ${controlsVisible ? 'controls-visible' : ''}`} tabIndex={0} role="region" aria-label="Video player. Space or K to play, arrows to seek, M to mute, F for fullscreen." onKeyDown={onKeyDown} onPointerMove={showControls} onPointerDown={showControls} onFocus={showControls} onBlur={showControls}>
        <video ref={videoRef} playsInline disableRemotePlayback aria-label={playback.channel.name}
          onClick={togglePlay} onDoubleClick={() => void toggleFullscreen()}
          onPlay={() => { setPaused(false); showControls(); }} onPause={() => { setPaused(true); if (videoRef.current!.readyState >= 2) setWaiting(false); }}
          onPlaying={() => setWaiting(false)} onWaiting={() => setWaiting(true)} onSeeking={() => setWaiting(true)} onSeeked={() => setWaiting(false)}
          onEnded={() => { setPaused(true); setWaiting(false); if (!playback.live) { wantsPlay.current = false; setCurrent(archiveDuration); } }}
          onTimeUpdate={updateTimeline} onProgress={updateTimeline} onDurationChange={updateTimeline}
          onResize={() => setActiveHeight(videoRef.current?.videoHeight ?? 0)}
          onVolumeChange={updateAudio} />
        {waiting && !error && <div className="player-loading" role="status"><div className="spinner" /><span>{current > 0 ? 'Buffering…' : 'Loading video…'}</span></div>}
        {!waiting && paused && !error && <button className="player-big-play" onClick={togglePlay} aria-label="Start playback"><Icon name="play" /></button>}
        {error && <div className="player-error" role="alert"><strong>Unable to play this channel</strong><p>{error}</p><div><button onClick={() => { setError(''); setNotice(''); setWaiting(true); setAttempt(a => a + 1); }}>Retry stream</button></div></div>}
        {notice && <p className="player-notice" role="status">{notice}</p>}
        <div className="player-controls" inert={!controlsVisible}>
          <div className="player-timeline" style={{ background: `linear-gradient(to right, #ef4444 ${percent(timelinePosition)}%, #ffffff66 ${percent(timelinePosition)}%, #ffffff66 ${percent(buffered)}%, #ffffff33 ${percent(buffered)}%)` }}>
            <input type="range" aria-label="Seek" min={range.start} max={range.end || 1} step="0.1" value={Math.max(range.start, Math.min(timelinePosition, range.end))} disabled={span <= 0 || !!error}
              onPointerDown={e => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
              onChange={e => { const value = Number(e.target.value); if (dragging.current) setScrub(value); else seek(value); }}
              onPointerUp={e => { if (dragging.current) { dragging.current = false; seek(Number(e.currentTarget.value)); } }}
              onPointerCancel={() => { dragging.current = false; setScrub(null); }}
              aria-valuetext={`${formatPlaybackTime(timelinePosition - range.start)} of ${formatPlaybackTime(span)}`} />
          </div>
          <div className="player-control-row">
            <button className="player-icon-button" onClick={togglePlay} disabled={!!error} aria-label={paused ? 'Play' : 'Pause'} title={paused ? 'Play (k)' : 'Pause (k)'}><Icon name={paused ? 'play' : 'pause'} /></button>
            <button className="player-icon-button" onClick={() => { videoRef.current!.muted = !muted; }} aria-label={muted ? 'Unmute' : 'Mute'} title="Mute (m)"><Icon name={muted || volume === 0 ? 'muted' : 'volume'} /></button>
            <input className="player-volume" type="range" aria-label="Volume" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={e => { videoRef.current!.volume = Number(e.target.value); videoRef.current!.muted = false; }} />
            {playback.live ? <button className={`player-live ${atLive ? 'at-live' : ''}`} disabled={span <= 0 || !!error} onClick={() => { seek(hlsRef.current?.liveSyncPosition ?? range.end - 2); if (videoRef.current!.paused) togglePlay(); }} title="Jump to live"><span />{atLive ? 'LIVE' : 'GO LIVE'}</button> : <span className="player-time">{formatPlaybackTime(timelinePosition - range.start)} / {formatPlaybackTime(span)}</span>}
            <div className="player-control-spacer" />
            <select className="player-quality" aria-label="Video quality" title="Video quality — Auto adapts to your connection" value={quality === 'auto' || quality === 'original' ? quality : String(qualityHeights[qualityLevel(qualityHeights.map(height => ({ height })), quality)])} onChange={e => changeQuality(e.target.value as Quality)}>
              <option value="auto">Auto{adaptive && activeHeight ? ` (${activeHeight}p)` : ''}</option>
              {[...qualityHeights].sort((a, b) => b - a).map(height => <option key={height} value={height}>{height}p</option>)}
              <option value="original">Original</option>
            </select>
            {!playback.live && <select className="player-speed" aria-label="Playback speed" defaultValue="1" onChange={e => { playbackRate.current = Number(e.target.value); videoRef.current!.playbackRate = playbackRate.current; }}>{[0.5, 1, 1.25, 1.5, 2].map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select>}
            {document.pictureInPictureEnabled && <button className="player-icon-button player-pip" disabled={waiting || !!error} onClick={() => void togglePip()} aria-label={pip ? 'Exit picture-in-picture' : 'Picture-in-picture'} title="Picture-in-picture"><Icon name="pip" /></button>}
            <button className="player-icon-button" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} title="Fullscreen (f)"><Icon name="fullscreen" /></button>
          </div>
        </div>
      </div>
      <p className="player-help">Space to pause · ← → to seek · M to mute · F for fullscreen</p>
    </section>
  );
}
