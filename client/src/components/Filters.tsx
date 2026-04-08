interface Props {
  selectedDay: number | null;
  onDayChange: (day: number | null) => void;
  groups: string[];
  selectedGroup: string;
  onGroupChange: (group: string) => void;
  liveOnly: boolean;
  onLiveOnlyChange: (live: boolean) => void;
  starredOnly: boolean;
  onStarredOnlyChange: (starred: boolean) => void;
  starredCount: number;
}

function getDayLabel(offset: number): string {
  if (offset === 0) return 'Today';
  if (offset === -1) return 'Yesterday';
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function Filters({ selectedDay, onDayChange, groups, selectedGroup, onGroupChange, liveOnly, onLiveOnlyChange, starredOnly, onStarredOnlyChange, starredCount }: Props) {
  const days = [0, -1, -2, -3, -4, -5, -6];

  return (
    <div className="filters">
      <div className="day-filter">
        <button
          className={`day-btn live-now-btn ${liveOnly ? 'active' : ''}`}
          onClick={() => onLiveOnlyChange(!liveOnly)}
        >
          Live Now
        </button>
        <button
          className={`day-btn ${!liveOnly && selectedDay === null ? 'active' : ''}`}
          onClick={() => { onLiveOnlyChange(false); onDayChange(null); }}
        >
          All Days
        </button>
        {days.map((d) => (
          <button
            key={d}
            className={`day-btn ${!liveOnly && selectedDay === d ? 'active' : ''}`}
            onClick={() => { onLiveOnlyChange(false); onDayChange(d); }}
          >
            {getDayLabel(d)}
          </button>
        ))}
      </div>
      <button
        className={`day-btn starred-btn ${starredOnly ? 'active' : ''}`}
        onClick={() => onStarredOnlyChange(!starredOnly)}
        disabled={starredCount === 0}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={starredOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        Starred{starredCount > 0 ? ` (${starredCount})` : ''}
      </button>
      <div className="group-filter">
        <select value={selectedGroup} onChange={(e) => onGroupChange(e.target.value)}>
          <option value="">All Groups</option>
          {groups.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
