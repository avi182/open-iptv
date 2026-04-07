import { useState, useMemo, useCallback, useRef, useEffect, useSyncExternalStore } from 'react';
import type { Channel } from '../types';

const MIN_WIDTH = 180;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 280;
const STORAGE_KEY = 'sidebar-width';

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia('(min-width: 769px)');
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia('(min-width: 769px)').matches,
  );
}

interface Props {
  channels: Channel[];
  selectedChannel: string;
  onSelect: (channelId: string) => void;
  isOpen?: boolean;
}

export function ChannelSidebar({ channels, selectedChannel, onSelect, isOpen }: Props) {
  const [channelSearch, setChannelSearch] = useState('');
  const isDesktop = useIsDesktop();
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(saved))) : DEFAULT_WIDTH;
  });
  const isDragging = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(width);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      widthRef.current = newWidth;
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(STORAGE_KEY, String(widthRef.current));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const filteredChannels = useMemo(() => {
    if (!channelSearch.trim()) return channels;
    const q = channelSearch.toLowerCase();
    return channels.filter((ch) => ch.name.toLowerCase().includes(q));
  }, [channels, channelSearch]);

  return (
    <div
      ref={sidebarRef}
      className={`channel-sidebar ${isOpen ? 'open' : ''}`}
      style={{ width: isDesktop ? width : undefined }}
    >
      <div className="sidebar-header">
        <h3>Channels ({filteredChannels.length})</h3>
        {selectedChannel && (
          <button className="clear-channel" onClick={() => onSelect('')}>
            Clear
          </button>
        )}
      </div>
      <div className="channel-search">
        <input
          type="text"
          className="channel-search-input"
          placeholder="Search channels..."
          value={channelSearch}
          onChange={(e) => setChannelSearch(e.target.value)}
        />
        {channelSearch && (
          <button className="channel-search-clear" onClick={() => setChannelSearch('')} aria-label="Clear search">
            &times;
          </button>
        )}
      </div>
      <div className="channel-list">
        {filteredChannels.map((ch) => (
          <button
            key={ch.id}
            className={`channel-item ${selectedChannel === ch.id ? 'active' : ''}`}
            onClick={() => onSelect(ch.id === selectedChannel ? '' : ch.id)}
          >
            <img
              src={ch.logo}
              alt=""
              className="channel-logo"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span className="channel-name">{ch.name}</span>
            {ch.catchupDays > 0 && <span className="catchup-badge">{ch.catchupDays}d</span>}
          </button>
        ))}
      </div>
      {isDesktop && (
        <div className="sidebar-resize-handle" onMouseDown={handleMouseDown} />
      )}
    </div>
  );
}
