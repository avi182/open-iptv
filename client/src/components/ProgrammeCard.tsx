import { useContext, useState, useEffect } from 'react';
import { SettingsContext } from '../contexts/SettingsContext';
import type { Channel, Programme } from '../types';
import { buildStreamUrl, copyToClipboard, getProgrammeStatus } from '../utils/catchup';
import { createPlayback } from '../utils/playback';
import { useDownload } from '../hooks/useDownload';

interface Props {
  programme: Programme;
  channel: Channel | undefined;
  showChannel: boolean;
  isStarred: boolean;
  onToggleStar: (id: string) => void;
  onPlay: (channel: Channel, programme?: Programme) => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${date} ${time}`;
}

function getRelativeTime(programme: Programme, status: string): string {
  const now = Math.floor(Date.now() / 1000);
  if (status === 'live') {
    const remaining = programme.stop - now;
    if (remaining < 60) return 'Ending soon';
    const mins = Math.floor(remaining / 60);
    if (mins < 60) return `${mins}m left`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return remMins > 0 ? `${hrs}h ${remMins}m left` : `${hrs}h left`;
  }
  if (status === 'past') {
    const ago = now - programme.stop;
    if (ago < 60) return 'Just ended';
    const mins = Math.floor(ago / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }
  if (status === 'future') {
    const until = programme.start - now;
    if (until < 60) return 'Starting soon';
    const mins = Math.floor(until / 60);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) {
      const remMins = mins % 60;
      return remMins > 0 ? `in ${hrs}h ${remMins}m` : `in ${hrs}h`;
    }
    const days = Math.floor(hrs / 24);
    return `in ${days}d`;
  }
  return '';
}

function getLiveProgress(programme: Programme): number {
  const now = Math.floor(Date.now() / 1000);
  const total = programme.stop - programme.start;
  if (total <= 0) return 0;
  const elapsed = now - programme.start;
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

export function ProgrammeCard({ programme, channel, showChannel, isStarred, onToggleStar, onPlay }: Props) {
  const { showCopy, showDownload } = useContext(SettingsContext);
  const [copied, setCopied] = useState(false);
  const status = getProgrammeStatus(programme);
  const streamUrl = channel ? buildStreamUrl(channel.streamUrl, programme) : '';
  const canPlay = channel && createPlayback(channel, programme) !== null;
  const isLive = status === 'live';

  const [progress, setProgress] = useState(() => isLive ? getLiveProgress(programme) : 0);

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      setProgress(getLiveProgress(programme));
    }, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, [isLive, programme]);

  const download = useDownload(streamUrl, programme, channel?.name);

  async function handleCopy() {
    await copyToClipboard(streamUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const relativeTime = getRelativeTime(programme, status);

  return (
    <div className={`programme-card ${status}`}>
      <div className="programme-header">
        <div className="programme-time">
          {formatTime(programme.start)} - {formatTime(programme.stop)}
          {relativeTime && <span className="programme-relative-time">{relativeTime}</span>}
        </div>
        <div className="programme-header-actions">
          <button
            className={`star-btn ${isStarred ? 'starred' : ''}`}
            onClick={() => onToggleStar(programme.id)}
            aria-label={isStarred ? 'Unstar programme' : 'Star programme'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={isStarred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          <span className={`status-badge ${status}`}>
            {status === 'live' ? 'LIVE' : status === 'past' ? 'Archive' : 'Upcoming'}
          </span>
        </div>
      </div>
      <div className="programme-title">{programme.title}</div>
      {showChannel && channel && (
        <div className="programme-channel">
          <img
            src={channel.logo}
            alt=""
            className="mini-logo"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          {channel.name}
        </div>
      )}
      {programme.description && (
        <div className="programme-desc">{programme.description}</div>
      )}
      {isLive && (
        <div className="live-progress">
          <div className="live-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}
      {canPlay && channel && (
        <div className="programme-actions">
          <button className="btn btn-watch" onClick={() => onPlay(channel, programme)}><span className="watch-button-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.5a.75.75 0 0 1 1.13-.65l7 4.5a.75.75 0 0 1 0 1.3l-7 4.5A.75.75 0 0 1 5 12.5Z" /></svg></span><span>{isLive ? 'Watch live' : 'Watch catch-up'}</span></button>
          {showCopy && <button className={`btn btn-copy ${copied ? 'copied' : ''}`} onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy URL'}
          </button>}
          {showDownload && <button
            className="btn btn-download"
            onClick={download.start}
            onMouseEnter={download.handleHover}
            title={download.sizeLabel ? `Estimated size: ${download.sizeLabel}` : download.probing ? 'Estimating size...' : undefined}
          >
            {download.status === 'started' ? 'Download started ✓' : `Download MP4${download.sizeLabel ? ` (${download.sizeLabel})` : ''}`}
          </button>}
        </div>
      )}
    </div>
  );
}
