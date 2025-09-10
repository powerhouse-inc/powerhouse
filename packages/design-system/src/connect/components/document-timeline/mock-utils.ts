import { addHours } from "date-fns";
import type {
  TimelineBarItem,
  TimelineDividerItem,
} from "./document-timeline.js";

// Generate timestamps with 1 hour difference starting from a base date
const generateTimestamps = (count: number) => {
  // Use a date from the past instead of future (2025)
  const baseDate = new Date();
  baseDate.setMonth(baseDate.getMonth() - 3); // Start from 3 months ago

  return Array.from({ length: count }, (_, i) =>
    addHours(baseDate, i).toISOString(),
  );
};

// Helper function to generate a large number of timeline items
export const generateLargeTimeline = (itemCount: number) => {
  const timestamps = generateTimestamps(itemCount);
  const timeline: Array<TimelineBarItem | TimelineDividerItem> = [];

  for (let i = 0; i < itemCount; i++) {
    // Add a divider every 5 items
    if (i > 0 && i % 5 === 0) {
      timeline.push({
        id: `divider-${i}`,
        type: "divider",
        timestampUtcMs: timestamps[i],
        title: i % 2 === 0 ? "Atlas Document" : "Ratified Atlas Document",
        subtitle: "Created",
      });
      continue;
    }

    // Generate random sizes for additions and deletions (0-4)
    let addSize = Math.floor(Math.random() * 5) as 0 | 1 | 2 | 3 | 4;
    let delSize = Math.floor(Math.random() * 5) as 0 | 1 | 2 | 3 | 4;

    // Ensure at least one of addSize or delSize is not zero
    if (addSize === 0 && delSize === 0) {
      // Randomly choose which one to make non-zero
      if (Math.random() > 0.5) {
        addSize = (Math.floor(Math.random() * 4) + 1) as 1 | 2 | 3 | 4;
      } else {
        delSize = (Math.floor(Math.random() * 4) + 1) as 1 | 2 | 3 | 4;
      }
    }

    // Generate random count of additions and deletions
    const additions = addSize === 0 ? 0 : Math.floor(Math.random() * 100) + 1;
    const deletions = delSize === 0 ? 0 : Math.floor(Math.random() * 100) + 1;

    timeline.push({
      id: `bar-${i}`,
      type: "bar",
      addSize,
      delSize,
      timestampUtcMs: timestamps[i],
      additions,
      deletions,
    });
  }

  return timeline;
};
