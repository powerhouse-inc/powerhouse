import { type DocumentToolbarProps } from "@powerhousedao/design-system";
import {
  AnalyticsGranularity,
  AnalyticsPath,
  DateTime,
  useAnalyticsQuery,
} from "@powerhousedao/reactor-browser/analytics";
import { useMemo } from "react";

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
  addSize: number;
  delSize: number;
  additions: number;
  deletions: number;
  timestamp: string;
  date: Date;
  endDate: Date;
  revision?: number;
};

type DividerItem = {
  id: string;
  type: "divider";
  revision?: number;
};

type TimelineItem = BarItem | DividerItem;

type TimelineResult = {
  isLoading: boolean;
  data: DocumentToolbarProps["timelineItems"];
};

export const useTimelineItems = (
  documentId?: string,
  startTimestamp?: string,
): TimelineResult => {
  const start = startTimestamp
    ? DateTime.fromISO(startTimestamp)
    : DateTime.now().startOf("day");

  const { data: diffResult, isLoading } = useAnalyticsQuery({
    start,
    end: DateTime.now().endOf("day"),
    granularity: AnalyticsGranularity.Hourly,
    metrics: ["Count"],
    select: {
      changes: [AnalyticsPath.fromString(`changes`)],
      document: [AnalyticsPath.fromString(`document/${documentId}`)],
    },
    lod: {
      changes: 2,
    },
    currency: AnalyticsPath.fromString(""),
  });

  // memoize the mapped result to avoid recalculation on rerenders
  const mappedResult = useMemo(() => {
    if (!diffResult) return [];

    return diffResult
      .sort((a, b) => {
        const aDate = new Date(a.start as unknown as Date);
        const bDate = new Date(b.start as unknown as Date);
        return aDate.getTime() - bDate.getTime();
      })
      .map((result) => {
        const { additions, deletions } = result.rows.reduce(
          (acc, row) => {
            if (
              (row.dimensions.changes.path as unknown as string) ===
              "changes/add"
            ) {
              acc.additions += row.sum;
            } else if (
              (row.dimensions.changes.path as unknown as string) ===
              "changes/remove"
            ) {
              acc.deletions += row.sum;
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
          timestamp: startDate.toISOString(),
          date: startDate,
          endDate: new Date(result.end as unknown as Date),
          revision: 0,
        };
      });
  }, [diffResult]);

  // memoize the divider insertion to avoid recalculation
  const resultWithDividers = useMemo(() => {
    if (!mappedResult.length) return [];

    const result: TimelineItem[] = [];
    mappedResult.forEach((item, index) => {
      result.push(item);

      // Check if there's a next item and if they're not in consecutive hours
      if (index < mappedResult.length - 1) {
        const currentDate = new Date(item.date);
        const nextDate = new Date(mappedResult[index + 1].date);

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
            id: `divider-${item.id}-${mappedResult[index + 1].id}`,
            type: "divider" as const,
            revision: 0,
          });
        }
      }
    });

    return result;
  }, [mappedResult]);

  return {
    isLoading,
    data: resultWithDividers as DocumentToolbarProps["timelineItems"],
  };
};
