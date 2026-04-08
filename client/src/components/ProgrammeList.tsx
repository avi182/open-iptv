import type { Channel, Programme } from '../types';
import { ProgrammeCard } from './ProgrammeCard';

interface Props {
  programmes: Programme[];
  channels: Channel[];
  selectedChannel: string;
  starredIds: Set<string>;
  onToggleStar: (id: string) => void;
}

export function ProgrammeList({ programmes, channels, selectedChannel, starredIds, onToggleStar }: Props) {
  const channelMap = new Map(channels.map((c) => [c.id, c]));

  if (programmes.length === 0) {
    return <div className="empty-state">No programmes found. Try adjusting your filters.</div>;
  }

  // If a channel is selected, show flat list
  if (selectedChannel) {
    return (
      <div className="programme-list">
        {programmes.map((p) => (
          <ProgrammeCard
            key={p.id}
            programme={p}
            channel={channelMap.get(p.channelId)}
            showChannel={false}
            isStarred={starredIds.has(p.id)}
            onToggleStar={onToggleStar}
          />
        ))}
      </div>
    );
  }

  // Otherwise group by channel
  const grouped = new Map<string, Programme[]>();
  for (const p of programmes) {
    const list = grouped.get(p.channelId) || [];
    list.push(p);
    grouped.set(p.channelId, list);
  }

  return (
    <div className="programme-list">
      {Array.from(grouped.entries()).map(([channelId, progs]) => {
        const channel = channelMap.get(channelId);
        return (
          <div key={channelId} className="channel-group">
            <div className="channel-group-header">
              {channel && (
                <img
                  src={channel.logo}
                  alt=""
                  className="group-logo"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <h3>{channel?.name || channelId}</h3>
            </div>
            {progs.map((p) => (
              <ProgrammeCard
                key={p.id}
                programme={p}
                channel={channel}
                showChannel={false}
                isStarred={starredIds.has(p.id)}
                onToggleStar={onToggleStar}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
