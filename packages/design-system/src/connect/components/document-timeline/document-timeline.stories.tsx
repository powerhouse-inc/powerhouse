import { type Meta, type StoryObj } from "@storybook/react";
import { addHours } from "date-fns";
import {
  DocumentTimeline,
  type TimelineBarItem,
  type TimelineDividerItem,
} from "./document-timeline.js";

const meta = {
  title: "Connect/Components/DocumentTimeline",
  component: DocumentTimeline,
} satisfies Meta<typeof DocumentTimeline>;

export default meta;

type Story = StoryObj<typeof meta>;

// Generate timestamps with 1 hour difference starting from a base date
const generateTimestamps = (count: number) => {
  // Use a date from the past instead of future (2025)
  const baseDate = new Date();
  baseDate.setMonth(baseDate.getMonth() - 3); // Start from 3 months ago

  return Array.from({ length: count }, (_, i) =>
    addHours(baseDate, i).toISOString(),
  );
};

// Get a base timestamp for static stories (3 months ago)
const getBaseTimestamp = () => {
  const date = new Date();
  date.setMonth(date.getMonth() - 3);
  return date.toISOString();
};

// Helper function to generate a date offset from the base timestamp
const getOffsetTimestamp = (hoursOffset: number) => {
  const date = new Date(getBaseTimestamp());
  date.setHours(date.getHours() + hoursOffset);
  return date.toISOString();
};

// Helper function to generate a large number of timeline items
const generateLargeTimeline = (itemCount: number) => {
  const timestamps = generateTimestamps(itemCount);
  const timeline: Array<TimelineBarItem | TimelineDividerItem> = [];

  for (let i = 0; i < itemCount; i++) {
    // Add a divider every 5 items
    if (i > 0 && i % 5 === 0) {
      timeline.push({
        id: `divider-${i}`,
        type: "divider",
        timestamp: timestamps[i],
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
      timestamp: timestamps[i],
      additions,
      deletions,
    });
  }

  return timeline;
};

export const Default: Story = {
  args: {
    timeline: [
      {
        id: "bar1",
        type: "bar",
        addSize: 2,
        delSize: 1,
        timestamp: getOffsetTimestamp(0),
        additions: 25,
        deletions: 12,
      },
      {
        id: "divider1",
        type: "divider",
        timestamp: getOffsetTimestamp(1),
        title: "First Commit",
        subtitle: "Initial changes",
      },
      {
        id: "bar2",
        type: "bar",
        addSize: 4,
        delSize: 0,
        timestamp: getOffsetTimestamp(2),
        additions: 87,
        deletions: 0,
      },
      {
        id: "bar3",
        type: "bar",
        addSize: 1,
        delSize: 3,
        timestamp: getOffsetTimestamp(3),
        additions: 10,
        deletions: 45,
      },
      {
        id: "divider2",
        type: "divider",
        timestamp: getOffsetTimestamp(4),
        title: "Feature Addition",
        subtitle: "New component",
      },
      {
        id: "bar4",
        type: "bar",
        addSize: 3,
        delSize: 2,
        timestamp: getOffsetTimestamp(5),
        additions: 52,
        deletions: 24,
      },
      {
        id: "bar5",
        type: "bar",
        addSize: 2,
        delSize: 2,
        timestamp: getOffsetTimestamp(6),
        additions: 38,
        deletions: 29,
      },
      {
        id: "consecutive1",
        type: "bar",
        addSize: 1,
        delSize: 4,
        timestamp: getOffsetTimestamp(7),
        additions: 18,
        deletions: 76,
      },
      {
        id: "consecutive2",
        type: "bar",
        addSize: 2,
        delSize: 3,
        timestamp: getOffsetTimestamp(8),
        additions: 35,
        deletions: 47,
      },
      {
        id: "consecutive3",
        type: "bar",
        addSize: 3,
        delSize: 2,
        timestamp: getOffsetTimestamp(9),
        additions: 42,
        deletions: 21,
      },
      {
        id: "consecutive4",
        type: "bar",
        addSize: 4,
        delSize: 1,
        timestamp: getOffsetTimestamp(10),
        additions: 96,
        deletions: 15,
      },
      {
        id: "consecutive5",
        type: "bar",
        addSize: 1,
        delSize: 3,
        timestamp: getOffsetTimestamp(11),
        additions: 14,
        deletions: 53,
      },
      {
        id: "consecutive6",
        type: "bar",
        addSize: 4,
        delSize: 4,
        timestamp: getOffsetTimestamp(12),
        additions: 78,
        deletions: 92,
      },
      {
        id: "divider3",
        type: "divider",
        timestamp: getOffsetTimestamp(13),
        title: "Bug Fix",
        subtitle: "Critical issue",
      },
      {
        id: "bar6",
        type: "bar",
        addSize: 1,
        delSize: 0,
        timestamp: getOffsetTimestamp(14),
        additions: 8,
        deletions: 0,
      },
      {
        id: "bar7",
        type: "bar",
        addSize: 0,
        delSize: 1,
        timestamp: getOffsetTimestamp(15),
        additions: 0,
        deletions: 3,
      },
      {
        id: "divider4",
        type: "divider",
        timestamp: getOffsetTimestamp(16),
        title: "Refactoring",
        subtitle: "Code cleanup",
      },
      {
        id: "bar8",
        type: "bar",
        addSize: 4,
        delSize: 4,
        timestamp: getOffsetTimestamp(17),
        additions: 67,
        deletions: 81,
      },
      {
        id: "bar9",
        type: "bar",
        addSize: 3,
        delSize: 1,
        timestamp: getOffsetTimestamp(18),
        additions: 56,
        deletions: 17,
      },
      {
        id: "divider5",
        type: "divider",
        timestamp: getOffsetTimestamp(19),
        title: "Version Update",
        subtitle: "Release prep",
      },
      {
        id: "bar10",
        type: "bar",
        addSize: 2,
        delSize: 3,
        timestamp: getOffsetTimestamp(20),
        additions: 31,
        deletions: 49,
      },
    ],
  },
};

export const OnlyBars: Story = {
  args: {
    timeline: [
      {
        id: "bar1",
        type: "bar",
        addSize: 1,
        delSize: 0,
        timestamp: getOffsetTimestamp(0),
        additions: 15,
        deletions: 0,
      },
      {
        id: "bar2",
        type: "bar",
        addSize: 2,
        delSize: 1,
        timestamp: getOffsetTimestamp(1),
        additions: 27,
        deletions: 8,
      },
      {
        id: "bar3",
        type: "bar",
        addSize: 3,
        delSize: 2,
        timestamp: getOffsetTimestamp(2),
        additions: 45,
        deletions: 23,
      },
      {
        id: "bar4",
        type: "bar",
        addSize: 4,
        delSize: 3,
        timestamp: getOffsetTimestamp(3),
        additions: 89,
        deletions: 41,
      },
      {
        id: "bar5",
        type: "bar",
        addSize: 0,
        delSize: 4,
        timestamp: getOffsetTimestamp(4),
        additions: 0,
        deletions: 63,
      },
      {
        id: "bar6",
        type: "bar",
        addSize: 4,
        delSize: 4,
        timestamp: getOffsetTimestamp(5),
        additions: 72,
        deletions: 68,
      },
      {
        id: "bar7",
        type: "bar",
        addSize: 3,
        delSize: 0,
        timestamp: getOffsetTimestamp(6),
        additions: 54,
        deletions: 0,
      },
      {
        id: "bar8",
        type: "bar",
        addSize: 2,
        delSize: 3,
        timestamp: getOffsetTimestamp(7),
        additions: 32,
        deletions: 44,
      },
      {
        id: "bar9",
        type: "bar",
        addSize: 1,
        delSize: 1,
        timestamp: getOffsetTimestamp(8),
        additions: 19,
        deletions: 12,
      },
      {
        id: "bar10",
        type: "bar",
        addSize: 0,
        delSize: 0,
        timestamp: getOffsetTimestamp(9),
        additions: 0,
        deletions: 0,
      },
    ],
  },
};

export const AlternatingPattern: Story = {
  args: {
    timeline: [
      {
        id: "bar1",
        type: "bar",
        addSize: 3,
        delSize: 1,
        timestamp: getOffsetTimestamp(0),
        additions: 47,
        deletions: 13,
      },
      {
        id: "divider1",
        type: "divider",
        timestamp: getOffsetTimestamp(1),
        title: "Sprint Planning",
        subtitle: "New Features",
      },
      {
        id: "bar2",
        type: "bar",
        addSize: 2,
        delSize: 2,
        timestamp: getOffsetTimestamp(2),
        additions: 28,
        deletions: 26,
      },
      {
        id: "divider2",
        type: "divider",
        timestamp: getOffsetTimestamp(3),
        title: "Task Assignment",
        subtitle: "Development",
      },
      {
        id: "bar3",
        type: "bar",
        addSize: 4,
        delSize: 0,
        timestamp: getOffsetTimestamp(4),
        additions: 65,
        deletions: 0,
      },
      {
        id: "divider3",
        type: "divider",
        timestamp: getOffsetTimestamp(5),
        title: "Code Freeze",
        subtitle: "Pre-release",
      },
      {
        id: "bar4",
        type: "bar",
        addSize: 1,
        delSize: 4,
        timestamp: getOffsetTimestamp(6),
        additions: 11,
        deletions: 59,
      },
      {
        id: "divider4",
        type: "divider",
        timestamp: getOffsetTimestamp(7),
        title: "Testing Phase",
        subtitle: "QA Review",
      },
      {
        id: "bar5",
        type: "bar",
        addSize: 3,
        delSize: 3,
        timestamp: getOffsetTimestamp(8),
        additions: 43,
        deletions: 37,
      },
    ],
  },
};

export const MinimalWithDividers: Story = {
  args: {
    timeline: [
      {
        id: "bar1",
        type: "bar",
        addSize: 2,
        delSize: 2,
        timestamp: getOffsetTimestamp(0),
        additions: 24,
        deletions: 29,
      },
      {
        id: "divider1",
        type: "divider",
        timestamp: getOffsetTimestamp(1),
        title: "Version Bump",
        subtitle: "v1.2.0",
      },
      {
        id: "bar2",
        type: "bar",
        addSize: 3,
        delSize: 1,
        timestamp: getOffsetTimestamp(2),
        additions: 51,
        deletions: 9,
      },
      {
        id: "divider2",
        type: "divider",
        timestamp: getOffsetTimestamp(3),
        title: "Code Review",
        subtitle: "Pull Request",
      },
      {
        id: "bar3",
        type: "bar",
        addSize: 1,
        delSize: 3,
        timestamp: getOffsetTimestamp(4),
        additions: 17,
        deletions: 42,
      },
    ],
  },
};

export const Empty: Story = {
  args: {
    timeline: [],
  },
};

export const LargeHorizontalScroll: Story = {
  args: {
    timeline: generateLargeTimeline(50),
  },
  parameters: {
    docs: {
      description: {
        story:
          "A timeline with 50 items to test horizontal scrolling behavior.",
      },
    },
  },
};

export const ExtremeHorizontalScroll: Story = {
  args: {
    timeline: generateLargeTimeline(200),
  },
  parameters: {
    docs: {
      description: {
        story:
          "A timeline with 100 items to test performance with extensive horizontal scrolling.",
      },
    },
  },
};

// Add a test story with clearly defined dividers
export const DividersWithTitles: Story = {
  args: {
    timeline: [
      {
        id: "bar-test-1",
        type: "bar",
        addSize: 3,
        delSize: 2,
        timestamp: getOffsetTimestamp(0),
        additions: 45,
        deletions: 20,
      },
      {
        id: "divider-test-1",
        type: "divider",
        timestamp: getOffsetTimestamp(1),
        title: "Debug Title",
        subtitle: "Debug Subtitle",
      },
      {
        id: "bar-test-2",
        type: "bar",
        addSize: 2,
        delSize: 1,
        timestamp: getOffsetTimestamp(2),
        additions: 25,
        deletions: 10,
      },
    ],
  },
};
