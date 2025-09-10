import type {
  GroupedPeriodResults,
  UseAnalyticsQueryResult,
} from "@powerhousedao/reactor-browser/analytics";
import {
  type GroupedPeriodResults,
  AnalyticsGranularity,
  AnalyticsPath,
} from "@powerhousedao/analytics-engine-core";
import type { UseAnalyticsQueryResult } from "@powerhousedao/reactor-browser";
import { useAnalyticsQuery } from "@powerhousedao/reactor-browser";
import { DateTime } from "luxon";

const getBarSize = (value: number) => {
  if (value <= 0) return 0;
  if (value > 0 && value <= 50) return 1;
  if (value > 50 && value <= 100) return 2;
  if (value > 100 && value <= 250) return 3;
  return 4;
};

// Define types for our timeline items
type BarItem = {
  id: string;
  type: "bar";
  addSize: 0 | 1 | 2 | 3 | 4;
  delSize: 0 | 1 | 2 | 3 | 4;
  additions: number;
  deletions: number;
  timestampUtcMs: string;
  startDate: Date;
  endDate: Date;
  revision?: number;
};

type DividerItem = {
  id: string;
  type: "divider";
  revision?: number;
  startDate?: Date;
  endDate?: Date;
};

type TimelineItem = BarItem | DividerItem;

function addItemsDividers(items: BarItem[]): TimelineItem[] {
  if (!items.length) return [];

  const result: TimelineItem[] = [];
  items.forEach((item, index) => {
    result.push(item);

    // Check if there's a next item and if they're not in consecutive hours
    if (index < items.length - 1) {
      const currentDate = new Date(item.startDate);
      const nextDate = new Date(items[index + 1].startDate);

      const currentHour = currentDate.getHours();
      const nextHour = nextDate.getHours();

      // Get day parts (without time) for comparison
      const currentDay = currentDate.toDateString();
      const nextDay = nextDate.toDateString();

      // If different days or non-consecutive hours on the same day
      if (
        currentDay !== nextDay ||
        (currentDay === nextDay && Math.abs(nextHour - currentHour) > 1)
      ) {
        result.push({
          id: `divider-${item.id}-${items[index + 1].id}`,
          type: "divider" as const,
          revision: 0,
        });
      }
    }
  });

  return result;
}

function metricsToItems(metrics: GroupedPeriodResults): TimelineItem[] {
  if (!metrics) return [];

  const items = metrics
    .sort((a, b) => {
      const aDate = new Date(a.start as unknown as Date);
      const bDate = new Date(b.start as unknown as Date);
      return aDate.getTime() - bDate.getTime();
    })
    .filter((result) => {
      return result.rows.every((row) => row.value > 0);
    })
    .map((result) => {
      const { additions, deletions } = result.rows.reduce(
        (acc, row) => {
          if (
            (row.dimensions.changes.path as unknown as string) ===
            "ph/diff/changes/add"
          ) {
            acc.additions += row.value;
          } else if (
            (row.dimensions.changes.path as unknown as string) ===
            "ph/diff/changes/remove"
          ) {
            acc.deletions += row.value;
          }
          return acc;
        },
        { additions: 0, deletions: 0 },
      );

      const startDate = new Date(result.start as unknown as Date);

      return {
        id: startDate.toISOString(),
        type: "bar" as const,
        addSize: getBarSize(additions),
        delSize: getBarSize(deletions),
        additions,
        deletions,
        timestampUtcMs: startDate.toISOString(),
        startDate: startDate,
        endDate: new Date(result.end as unknown as Date),
        revision: 0,
      } as const;
    });

  return addItemsDividers(items);
}

export type UseTimelineItemsResult = UseAnalyticsQueryResult<TimelineItem[]>;

export const useTimelineItems = (
  documentId?: string,
  startTimestamp?: string,
  driveId?: string,
): UseTimelineItemsResult => {
  const start = startTimestamp
    ? DateTime.fromISO(startTimestamp)
    : DateTime.now().startOf("day");

  return useAnalyticsQuery<TimelineItem[]>(
    {
      start,
      end: DateTime.now().endOf("day"),
      granularity: AnalyticsGranularity.Hourly,
      metrics: ["Count"],
      select: {
        changes: [AnalyticsPath.fromString(`ph/diff/changes`)],
        document: [AnalyticsPath.fromString(`ph/diff/document/${documentId}`)],
      },
      lod: {
        changes: 4,
      },
    },
    {
      sources: [AnalyticsPath.fromString(`ph/diff/${driveId}/${documentId}`)],
      select: metricsToItems,
    },
  );
};
