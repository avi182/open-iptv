import { useContext, useDeferredValue, useMemo, useState } from 'react';
import { SettingsContext } from '../contexts/SettingsContext';
import type { Channel } from '../types';
import { copyToClipboard } from '../utils/catchup';

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

interface Props {
  channels: Channel[];
  selectedGroup: string;
  onGroupChange: (g: string) => void;
  groups: string[];
  onPlay: (channel: Channel) => void;
}

function ChannelCard({ channel, onPlay }: { channel: Channel; onPlay: (channel: Channel) => void }) {
  const { showCopy } = useContext(SettingsContext);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await copyToClipboard(channel.streamUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }


  return (
    <div className="channel-card">
      <button className="channel-card-header channel-watch" onClick={() => onPlay(channel)} aria-label={`Watch ${channel.name}`}>
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
      </button>
      <div className="channel-card-actions">
        <button className="live-card-btn watch" onClick={() => onPlay(channel)}><span className="watch-button-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.5a.75.75 0 0 1 1.13-.65l7 4.5a.75.75 0 0 1 0 1.3l-7 4.5A.75.75 0 0 1 5 12.5Z" /></svg></span><span>Watch</span></button>
        {showCopy && <button className={`live-card-btn copy ${copied ? 'copied' : ''}`} onClick={handleCopy}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {copied ? 'Copied!' : 'Copy'}
        </button>}
      </div>
    </div>
  );
}

export function ChannelGrid({ channels, selectedGroup, onGroupChange, groups, onPlay }: Props) {
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
            <ChannelCard key={ch.id} channel={ch} onPlay={onPlay} />
          ))}
        </div>
      )}
    </div>
  );
}
