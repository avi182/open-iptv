import { useDeferredValue, useMemo, useState } from 'react';
import type { Channel } from '../types';
import { copyToClipboard, openInVLC } from '../utils/catchup';

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

interface Props {
  channels: Channel[];
  selectedGroup: string;
  onGroupChange: (g: string) => void;
  groups: string[];
}

function ChannelCard({ channel }: { channel: Channel }) {
  const [copied, setCopied] = useState(false);
  const [vlcError, setVlcError] = useState('');

  async function handleCopy() {
    await copyToClipboard(channel.streamUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleVLC() {
    setVlcError('');
    try {
      await openInVLC(channel.streamUrl);
    } catch (err) {
      setVlcError(err instanceof Error ? err.message : 'Failed to open VLC');
      setTimeout(() => setVlcError(''), 3000);
    }
  }

  return (
    <div className="channel-card">
      <div className="channel-card-header">
        <img
          src={channel.logo}
          alt=""
          className="channel-card-logo"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="channel-card-info">
          <span className="channel-card-name">{channel.name}</span>
          {channel.group && <span className="channel-card-group">{channel.group}</span>}
        </div>
      </div>
      <div className="channel-card-actions">
        <button className={`live-card-btn copy ${copied ? 'copied' : ''}`} onClick={handleCopy}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button className="live-card-btn vlc" onClick={handleVLC}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          VLC
        </button>
      </div>
      {vlcError && <div className="channel-card-error">{vlcError}</div>}
    </div>
  );
}

export function ChannelGrid({ channels, selectedGroup, onGroupChange, groups }: Props) {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);

  const filtered = useMemo(() => {
    const q = normalize(deferred);
    return channels.filter((c) => {
      if (selectedGroup && c.group !== selectedGroup) return false;
      if (!q) return true;
      const name = normalize(c.name ?? '');
      const group = normalize(c.group ?? '');
      const id = normalize(c.id ?? '');
      return name.includes(q) || group.includes(q) || id.includes(q);
    });
  }, [channels, selectedGroup, deferred]);

  return (
    <div className="channel-grid-wrap">
      <div className="channel-grid-toolbar">
        <input
          type="text"
          className="channel-grid-search"
          placeholder="Search channels..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <select
          className="channel-grid-group"
          value={selectedGroup}
          onChange={(e) => onGroupChange(e.target.value)}
        >
          <option value="">All Groups</option>
          {groups.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <span className="channel-grid-count">{filtered.length} / {channels.length}</span>
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state">No channels match your filters.</div>
      ) : (
        <div className="channel-grid">
          {filtered.map((ch) => (
            <ChannelCard key={ch.id} channel={ch} />
          ))}
        </div>
      )}
    </div>
  );
}
