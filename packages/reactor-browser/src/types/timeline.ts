export type TimelineBarItem = {
  id: string;
  type: "bar";
  addSize?: 0 | 1 | 2 | 3 | 4;
  delSize?: 0 | 1 | 2 | 3 | 4;
  timestampUtcMs?: string;
  additions?: number;
  deletions?: number;
  revision?: number;
  startDate?: Date;
  endDate?: Date;
};

export type TimelineDividerItem = {
  id: string;
  type: "divider";
  timestampUtcMs?: string;
  title?: string;
  subtitle?: string;
  revision?: number;
  startDate?: Date;
  endDate?: Date;
};

export type TimelineItem = TimelineBarItem | TimelineDividerItem;
