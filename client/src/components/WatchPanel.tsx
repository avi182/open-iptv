import { useEffect, useMemo, useRef, useState } from 'react';
import type { Channel, Programme } from '../types';
import { createPlayback, getWatchingProgramme, type Playback } from '../utils/playback';
import VideoPlayer from './VideoPlayer';
import './WatchPanel.css';

interface Props {
  playback: Playback;
  programmes: Programme[];
  onPlay: (channel: Channel, programme?: Programme) => void;
  onClose: () => void;
}

const time = (timestamp: number) => new Date(timestamp * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const dateKey = (timestamp: number) => new Date(timestamp * 1000).toDateString();
const dayLabel = (timestamp: number, now: number) => dateKey(timestamp) === dateKey(now)
  ? 'Today'
  : new Date(timestamp * 1000).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export default function WatchPanel({ playback, programmes, onPlay, onClose }: Props) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const listRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);
  const schedule = useMemo(() => {
    const channelProgrammes = programmes.filter(programme => programme.channelId === playback.channel.id);
    // Keep the selected archive visible even if the guide no longer contains it.
    if (!playback.live && playback.programme && !channelProgrammes.some(p => p.id === playback.programme!.id)) {
      channelProgrammes.push(playback.programme);
    }
    return channelProgrammes.sort((a, b) => a.start - b.start);
  }, [programmes, playback.channel.id, playback.live, playback.programme]);
  const watching = getWatchingProgramme(playback, schedule, now);
  const next = schedule.find(programme => programme.start > now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15000);
    return () => clearInterval(timer);
  }, []);

  function showCurrent() {
    const list = listRef.current;
    const current = currentRef.current;
    if (list && current) {
      // Scroll only the programme list, keeping the video and page in place.
      if (getComputedStyle(list).overflowY === 'hidden') {
        list.scrollLeft += current.getBoundingClientRect().left - list.getBoundingClientRect().left - 12;
        list.scrollTop = 0;
      } else {
        list.scrollTop += current.getBoundingClientRect().top - list.getBoundingClientRect().top - 52;
      }
    }
  }

  function browseProgrammes(direction: number) {
    const list = listRef.current;
    if (!list) return;
    const card = list.querySelector('li');
    list.scrollBy({
      left: direction * (card ? card.getBoundingClientRect().width + 10 : list.clientWidth * .8),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }

  useEffect(() => { showCurrent(); }, [watching?.id, playback.channel.id]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(showCurrent);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="watch-layout">
      <div className="watch-layout-grid">
        <div className="watch-guide-slot">
          <aside className={`watch-guide ${playback.live ? '' : 'is-catchup'}`} aria-label={`Programme guide for ${playback.channel.name}`}>
            <header className="watch-guide-heading">
              <div className="watch-guide-channel">
                <span className="watch-guide-eyebrow">ON THIS CHANNEL</span>
                <h2 dir="auto">{playback.channel.name}</h2>
              </div>
              {!playback.live && <button className="guide-back-live" onClick={() => onPlay(playback.channel)}><span className="guide-live-dot" />Back to live</button>}
              <div className="guide-navigation">
                {watching && <button className="guide-current-button" onClick={showCurrent} aria-label="Show now playing programme" title="Show the programme being watched">Playing</button>}
                {schedule.length > 0 && <>
                  <button className="guide-browse-button" onClick={() => browseProgrammes(-1)} aria-label="Earlier programmes"><span aria-hidden="true">‹</span></button>
                  <button className="guide-browse-button" onClick={() => browseProgrammes(1)} aria-label="Later programmes"><span aria-hidden="true">›</span></button>
                </>}
              </div>
            </header>
            <div className="watch-guide-list" ref={listRef} tabIndex={0} aria-label="Channel schedule">
              {schedule.length === 0 ? <p className="watch-guide-empty">No programme information is available for this channel. You can still watch the live stream.</p> : (
                <ol className="watch-guide-programmes">
                  {schedule.map((programme, index) => {
                    const isWatching = programme.id === watching?.id;
                    const live = programme.start <= now && now < programme.stop;
                    const past = programme.stop <= now;
                    const playable = createPlayback(playback.channel, programme, now) !== null;
                    const newDay = index === 0 || dateKey(schedule[index - 1].start) !== dateKey(programme.start);
                    const progress = Math.max(0, Math.min(100, (now - programme.start) / Math.max(1, programme.stop - programme.start) * 100));
                    return (
                      <li key={programme.id}>
                        {newDay && <h3 className="watch-guide-day">{dayLabel(programme.start, now)}</h3>}
                        <button
                          className={`guide-programme ${isWatching ? 'is-watching' : ''} ${past ? 'is-past' : ''}`}
                          ref={isWatching ? currentRef : undefined}
                          aria-current={isWatching ? 'true' : undefined}
                          disabled={!playable && !isWatching}
                          onClick={() => { if (!isWatching) onPlay(playback.channel, programme); }}
                        >
                          <span className="guide-programme-meta">
                            <span className="guide-programme-date">{dayLabel(programme.start, now)} · </span>
                            <span className="guide-programme-time" dir="ltr"><time dateTime={new Date(programme.start * 1000).toISOString()}>{time(programme.start)}</time> – <time dateTime={new Date(programme.stop * 1000).toISOString()}>{time(programme.stop)}</time></span>
                          </span>
                          <span className="guide-programme-title" dir="auto">{programme.title}</span>
                          <span className="guide-programme-status">
                            {isWatching ? <span className="guide-watching-label"><span className="guide-playing-icon" aria-hidden="true">▶</span>Now playing<span className="guide-playback-mode"> · {playback.live ? 'Live' : 'Catch-up'}</span></span>
                              : live ? <span className="guide-on-now"><span className="guide-live-dot" />Live now</span>
                              : past ? playable ? '↶ Watch catch-up' : 'Ended'
                              : programme.id === next?.id ? 'Up next' : 'Upcoming'}
                          </span>
                          {live && <span className="guide-programme-progress" role="progressbar" aria-label="Programme progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{ width: `${progress}%` }} /></span>}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </aside>
        </div>
        <VideoPlayer playback={playback} currentProgramme={watching} onClose={onClose} />
      </div>
    </div>
  );
}
