import { useEffect, useState, useDeferredValue, useRef, useCallback } from 'react';
import type { Channel, Programme } from './types';
import { fetchChannels, fetchProgrammes } from './api';
import { useFilteredProgrammes, useSearchIndex, getUniqueGroups } from './hooks/useFilteredProgrammes';
import { SearchBar } from './components/SearchBar';
import { Filters } from './components/Filters';
import { ChannelSidebar } from './components/ChannelSidebar';
import { ProgrammeList } from './components/ProgrammeList';
import { LiveGrid } from './components/LiveGrid';
import './App.css';

const PAGE_SIZE = 100;
const STORAGE_KEY = 'openiptv-playlist-url';
function getStoredUrl(): string {
  return localStorage.getItem(STORAGE_KEY) ?? '';
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function starredKey(url: string): string {
  return `openiptv-starred-${hashString(url)}`;
}

function getStoredStarred(url: string): Set<string> {
  try {
    const raw = localStorage.getItem(starredKey(url));
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore corrupt data */ }
  return new Set();
}

export default function App() {
  const [playlistUrl, setPlaylistUrl] = useState(getStoredUrl);
  const [urlInput, setUrlInput] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [epgWarning, setEpgWarning] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('');
  const [liveOnly, setLiveOnly] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isRtl, setIsRtl] = useState(false);
  const [showChangeUrlDialog, setShowChangeUrlDialog] = useState(false);
  const [starredIds, setStarredIds] = useState<Set<string>>(() => getStoredStarred(playlistUrl));
  const [starredOnly, setStarredOnly] = useState(false);
  const deferredSearch = useDeferredValue(searchQuery);
  const isSearching = deferredSearch !== searchQuery;
  const mainContentRef = useRef<HTMLElement>(null);

  const searchIndex = useSearchIndex(programmes);

  // Reload starred items when playlist URL changes
  useEffect(() => {
    setStarredIds(getStoredStarred(playlistUrl));
    setStarredOnly(false);
  }, [playlistUrl]);

  // Load data when playlistUrl is set
  useEffect(() => {
    if (!playlistUrl) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      setEpgWarning('');
      setChannels([]);
      setProgrammes([]);
      try {
        const { channels: ch } = await fetchChannels(playlistUrl);
        if (cancelled) return;
        setChannels(ch);

        try {
          const pg = await fetchProgrammes(playlistUrl);
          if (cancelled) return;
          setProgrammes(pg);
        } catch {
          if (cancelled) return;
          setEpgWarning('Programme guide (EPG) is not available for this playlist. Channels are still usable.');
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [playlistUrl]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [deferredSearch, selectedDay, selectedGroup, selectedChannel, liveOnly, starredOnly]);

  // Auto-switch to "All Days" when user starts searching
  useEffect(() => {
    if (deferredSearch.trim()) {
      setSelectedDay(null);
      setLiveOnly(false);
    }
  }, [deferredSearch]);

  // Track scroll position for scroll-to-top button
  useEffect(() => {
    const el = mainContentRef.current;
    if (!el) return;
    function handleScroll() {
      setShowScrollTop((el?.scrollTop ?? 0) > 400);
    }
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [loading]);

  const scrollToTop = useCallback(() => {
    mainContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleChannelSelect = useCallback((channelId: string) => {
    setSelectedChannel(channelId);
    setSidebarOpen(false);
  }, []);

  const handleUrlSubmit = useCallback((url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    localStorage.setItem(STORAGE_KEY, trimmed);
    setPlaylistUrl(trimmed);
  }, []);

  const handleChangeUrl = useCallback(() => {
    setShowChangeUrlDialog(true);
  }, []);

  const confirmChangeUrl = useCallback(() => {
    setPlaylistUrl('');
    setChannels([]);
    setProgrammes([]);
    setError('');
    setEpgWarning('');
    localStorage.removeItem(STORAGE_KEY);
    setShowChangeUrlDialog(false);
  }, []);

  const toggleStar = useCallback((programmeId: string) => {
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (next.has(programmeId)) next.delete(programmeId);
      else next.add(programmeId);
      localStorage.setItem(starredKey(playlistUrl), JSON.stringify([...next]));
      return next;
    });
  }, [playlistUrl]);

  const toggleRtl = useCallback(() => {
    setIsRtl((prev) => {
      document.documentElement.dir = prev ? 'ltr' : 'rtl';
      return !prev;
    });
  }, []);

  const filtered = useFilteredProgrammes(programmes, searchIndex, channels, {
    searchQuery: deferredSearch,
    selectedDay,
    selectedGroup,
    selectedChannel,
    liveOnly,
  });

  const starFiltered = starredOnly ? filtered.filter((p) => starredIds.has(p.id)) : filtered;
  const visibleProgrammes = starFiltered.slice(0, visibleCount);
  const hasMore = visibleCount < starFiltered.length;

  const groups = getUniqueGroups(channels);

  // URL entry screen
  if (!playlistUrl) {
    return (
      <div className="url-setup">
        <div className="url-setup-card">
          <h1><span className="brand">Flick</span><span className="brand-accent">TV</span></h1>
          <p className="setup-tagline">Your streams, one guide. Paste your M3U playlist URL to get started.</p>
          <form
            className="url-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleUrlSubmit(urlInput);
            }}
          >
            <input
              type="url"
              className="url-input"
              placeholder="http://example.com/playlist.m3u8"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              autoFocus
              required
            />
            <button type="submit" className="url-submit-btn">
              Load Playlist
            </button>
          </form>
          <p className="url-hint">
            The EPG (programme guide) URL will be detected automatically from the playlist header.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading channels and programme guide...</p>
        <p className="loading-hint">First load may take a moment while the EPG data is fetched.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error">
        <h2>Error</h2>
        <p>{error}</p>
        <div className="error-actions">
          <button onClick={() => window.location.reload()}>Retry</button>
          <button className="btn-secondary" onClick={confirmChangeUrl}>Change URL</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1><span className="brand">Flick</span><span className="brand-accent">TV</span></h1>
        <div className="header-right">
          <div className="header-stats">
            {channels.length} channels · {starFiltered.length} shows
            {hasMore && ` (showing ${visibleCount})`}
          </div>
          <button className="change-url-btn" onClick={toggleRtl} title={isRtl ? 'Switch to LTR' : 'Switch to RTL'}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </button>
          <button className="change-url-btn" onClick={handleChangeUrl} title="Change playlist URL">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.248a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
        </div>
      </header>
      <div className="app-body">
        {/* Mobile sidebar overlay */}
        <div
          className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />
        <ChannelSidebar
          channels={selectedGroup ? channels.filter((c) => c.group === selectedGroup) : channels}
          selectedChannel={selectedChannel}
          onSelect={handleChannelSelect}
          isOpen={sidebarOpen}
        />
        <main className="main-content" ref={mainContentRef}>
          {epgWarning && (
            <div className="epg-warning">
              <span>{epgWarning}</span>
              <button onClick={() => setEpgWarning('')} aria-label="Dismiss">&times;</button>
            </div>
          )}
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
          <Filters
            selectedDay={selectedDay}
            onDayChange={setSelectedDay}
            groups={groups}
            selectedGroup={selectedGroup}
            onGroupChange={setSelectedGroup}
            liveOnly={liveOnly}
            onLiveOnlyChange={setLiveOnly}
            starredOnly={starredOnly}
            onStarredOnlyChange={setStarredOnly}
            starredCount={starredIds.size}
          />
          {isSearching && <div className="search-loading">Searching...</div>}
          {liveOnly ? (
            <LiveGrid
              programmes={visibleProgrammes}
              channels={channels}
              starredIds={starredIds}
              onToggleStar={toggleStar}
            />
          ) : (
            <ProgrammeList
              programmes={visibleProgrammes}
              channels={channels}
              selectedChannel={selectedChannel}
              starredIds={starredIds}
              onToggleStar={toggleStar}
            />
          )}
          {hasMore && (
            <button
              className="load-more-btn"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            >
              Show more ({starFiltered.length - visibleCount} remaining)
            </button>
          )}
        </main>
      </div>

      {/* Scroll to top */}
      <button
        className={`scroll-top-btn ${showScrollTop ? 'visible' : ''}`}
        onClick={scrollToTop}
        aria-label="Scroll to top"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
        </svg>
      </button>

      {/* Mobile sidebar toggle */}
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen((o) => !o)}
        aria-label="Toggle channels"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* Change URL confirmation dialog */}
      {showChangeUrlDialog && (
        <div className="dialog-overlay" onClick={() => setShowChangeUrlDialog(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Change Playlist URL</h3>
            <p>Are you sure you want to change the playlist URL? This will clear the current channels and programme data.</p>
            <div className="dialog-actions">
              <button className="btn-secondary" onClick={() => setShowChangeUrlDialog(false)}>Cancel</button>
              <button className="btn-primary" onClick={confirmChangeUrl}>Change URL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
