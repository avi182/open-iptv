import { useState, useEffect } from 'react';
import type { Channel, Programme } from '../types';
import { buildStreamUrl, copyToClipboard, getProgrammeStatus, openInVLC } from '../utils/catchup';

interface Props {
  programme: Programme;
  channel: Channel | undefined;
  showChannel: boolean;
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

export function ProgrammeCard({ programme, channel, showChannel }: Props) {
  const [copied, setCopied] = useState(false);
  const status = getProgrammeStatus(programme);
  const streamUrl = channel ? buildStreamUrl(channel.streamUrl, programme) : '';
  const canPlay = status === 'past' && channel && channel.catchupDays > 0;
  const isLive = status === 'live';

  const [progress, setProgress] = useState(() => isLive ? getLiveProgress(programme) : 0);

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      setProgress(getLiveProgress(programme));
    }, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, [isLive, programme]);

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
        <span className={`status-badge ${status}`}>
          {status === 'live' ? 'LIVE' : status === 'past' ? 'Archive' : 'Upcoming'}
        </span>
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
      {(canPlay || isLive) && (
        <div className="programme-actions">
          <button className={`btn btn-copy ${copied ? 'copied' : ''}`} onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy URL'}
          </button>
          <button className="btn btn-vlc" onClick={() => openInVLC(streamUrl)}>
            Open in VLC
          </button>
        </div>
      )}
    </div>
  );
}
