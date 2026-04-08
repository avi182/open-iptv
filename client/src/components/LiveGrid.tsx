import { useState, useEffect } from 'react';
import type { Channel, Programme } from '../types';
import { buildStreamUrl, copyToClipboard, downloadStream, formatFileSize, getProgrammeDuration, openInVLC, probeStream } from '../utils/catchup';

interface Props {
  programmes: Programme[];
  channels: Channel[];
  starredIds: Set<string>;
  onToggleStar: (id: string) => void;
}

function getLiveProgress(programme: Programme): number {
  const now = Math.floor(Date.now() / 1000);
  const total = programme.stop - programme.start;
  if (total <= 0) return 0;
  const elapsed = now - programme.start;
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

function formatTimeShort(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function getTimeLeft(programme: Programme): string {
  const now = Math.floor(Date.now() / 1000);
  const remaining = programme.stop - now;
  if (remaining < 60) return 'Ending soon';
  const mins = Math.floor(remaining / 60);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m left` : `${hrs}h left`;
}

function LiveCard({ programme, channel, isStarred, onToggleStar }: { programme: Programme; channel: Channel; isStarred: boolean; onToggleStar: (id: string) => void }) {
  const [progress, setProgress] = useState(() => getLiveProgress(programme));
  const [copied, setCopied] = useState(false);
  const streamUrl = buildStreamUrl(channel.streamUrl, programme);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(getLiveProgress(programme));
    }, 30000);
    return () => clearInterval(interval);
  }, [programme]);

  const [sizeLabel, setSizeLabel] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  async function handleCopy() {
    await copyToClipboard(streamUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadHover() {
    if (sizeLabel || probing || !streamUrl) return;
    setProbing(true);
    probeStream(streamUrl, getProgrammeDuration(programme))
      .then(bytes => setSizeLabel(bytes > 0 ? `~${formatFileSize(bytes)}` : null))
      .catch(() => {})
      .finally(() => setProbing(false));
  }

  return (
    <div className="live-card">
      <div className="live-card-glow" />
      <div className="live-card-header">
        <img
          src={channel.logo}
          alt=""
          className="live-card-logo"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="live-card-channel">
          <span className="live-card-channel-name">{channel.name}</span>
          <span className="live-card-time">
            {formatTimeShort(programme.start)} – {formatTimeShort(programme.stop)}
          </span>
        </div>
        <button
          className={`star-btn ${isStarred ? 'starred' : ''}`}
          onClick={() => onToggleStar(programme.id)}
          aria-label={isStarred ? 'Unstar programme' : 'Star programme'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={isStarred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
        <div className="live-card-indicator">
          <span className="live-dot" />
          LIVE
        </div>
      </div>
      <div className="live-card-body">
        <div className="live-card-title">{programme.title}</div>
        {programme.description && (
          <div className="live-card-desc">{programme.description}</div>
        )}
      </div>
      <div className="live-card-footer">
        <div className="live-card-progress-row">
          <div className="live-card-progress">
            <div className="live-card-progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <span className="live-card-timeleft">{getTimeLeft(programme)}</span>
        </div>
        <div className="live-card-actions">
          <button className={`live-card-btn copy ${copied ? 'copied' : ''}`} onClick={handleCopy}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button className="live-card-btn vlc" onClick={() => openInVLC(streamUrl)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            VLC
          </button>
          <button
            className="live-card-btn download"
            onClick={() => downloadStream(streamUrl, programme, channel.name)}
            onMouseEnter={handleDownloadHover}
            title={sizeLabel ? `Estimated size: ${sizeLabel}` : probing ? 'Estimating size...' : undefined}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            MP4{sizeLabel ? ` (${sizeLabel})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LiveGrid({ programmes, channels, starredIds, onToggleStar }: Props) {
  const channelMap = new Map(channels.map((c) => [c.id, c]));

  if (programmes.length === 0) {
    return <div className="empty-state">No live programmes right now.</div>;
  }

  return (
    <div className="live-grid">
      {programmes.map((p) => {
        const channel = channelMap.get(p.channelId);
        if (!channel) return null;
        return <LiveCard key={p.id} programme={p} channel={channel} isStarred={starredIds.has(p.id)} onToggleStar={onToggleStar} />;
      })}
    </div>
  );
}
