import { useState, useEffect } from 'react';
import type { Channel, Programme } from '../types';
import { buildStreamUrl, copyToClipboard, openInVLC } from '../utils/catchup';

interface Props {
  programmes: Programme[];
  channels: Channel[];
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

function LiveCard({ programme, channel }: { programme: Programme; channel: Channel }) {
  const [progress, setProgress] = useState(() => getLiveProgress(programme));
  const [copied, setCopied] = useState(false);
  const streamUrl = buildStreamUrl(channel.streamUrl, programme);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(getLiveProgress(programme));
    }, 30000);
    return () => clearInterval(interval);
  }, [programme]);

  async function handleCopy() {
    await copyToClipboard(streamUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        </div>
      </div>
    </div>
  );
}

export function LiveGrid({ programmes, channels }: Props) {
  const channelMap = new Map(channels.map((c) => [c.id, c]));

  if (programmes.length === 0) {
    return <div className="empty-state">No live programmes right now.</div>;
  }

  return (
    <div className="live-grid">
      {programmes.map((p) => {
        const channel = channelMap.get(p.channelId);
        if (!channel) return null;
        return <LiveCard key={p.id} programme={p} channel={channel} />;
      })}
    </div>
  );
}
