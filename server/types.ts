export interface Channel {
  id: string;
  name: string;
  logo: string;
  group: string;
  streamUrl: string;
  catchupDays: number;
}

export interface Programme {
  id: string;
  channelId: string;
  title: string;
  description: string;
  start: number;
  stop: number;
}
