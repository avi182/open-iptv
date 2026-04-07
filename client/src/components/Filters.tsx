interface Props {
  selectedDay: number | null;
  onDayChange: (day: number | null) => void;
  groups: string[];
  selectedGroup: string;
  onGroupChange: (group: string) => void;
  liveOnly: boolean;
  onLiveOnlyChange: (live: boolean) => void;
}

function getDayLabel(offset: number): string {
  if (offset === 0) return 'Today';
  if (offset === -1) return 'Yesterday';
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function Filters({ selectedDay, onDayChange, groups, selectedGroup, onGroupChange, liveOnly, onLiveOnlyChange }: Props) {
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
