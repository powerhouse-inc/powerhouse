import { type Meta, type StoryObj } from "@storybook/react";
import { DocumentTimeline } from "./document-timeline.js";
import { generateLargeTimeline } from "./mock-utils.js";

const meta = {
  title: "Connect/Components/DocumentTimeline",
  component: DocumentTimeline,
} satisfies Meta<typeof DocumentTimeline>;

export default meta;

type Story = StoryObj<typeof meta>;

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

export const Default: Story = {
  args: {
    timeline: [
      {
        id: "bar1",
        type: "bar",
        addSize: 2,
        delSize: 1,
        timestampUtcMs: getOffsetTimestamp(0),
        additions: 25,
        deletions: 12,
      },
      {
        id: "divider1",
        type: "divider",
        timestampUtcMs: getOffsetTimestamp(1),
        title: "First Commit",
        subtitle: "Initial changes",
      },
      {
        id: "bar2",
        type: "bar",
        addSize: 4,
        delSize: 0,
        timestampUtcMs: getOffsetTimestamp(2),
        additions: 87,
        deletions: 0,
      },
      {
        id: "bar3",
        type: "bar",
        addSize: 1,
        delSize: 3,
        timestampUtcMs: getOffsetTimestamp(3),
        additions: 10,
        deletions: 45,
      },
      {
        id: "divider2",
        type: "divider",
        timestampUtcMs: getOffsetTimestamp(4),
        title: "Feature Addition",
        subtitle: "New component",
      },
      {
        id: "bar4",
        type: "bar",
        addSize: 3,
        delSize: 2,
        timestampUtcMs: getOffsetTimestamp(5),
        additions: 52,
        deletions: 24,
      },
      {
        id: "bar5",
        type: "bar",
        addSize: 2,
        delSize: 2,
        timestampUtcMs: getOffsetTimestamp(6),
        additions: 38,
        deletions: 29,
      },
      {
        id: "consecutive1",
        type: "bar",
        addSize: 1,
        delSize: 4,
        timestampUtcMs: getOffsetTimestamp(7),
        additions: 18,
        deletions: 76,
      },
      {
        id: "consecutive2",
        type: "bar",
        addSize: 2,
        delSize: 3,
        timestampUtcMs: getOffsetTimestamp(8),
        additions: 35,
        deletions: 47,
      },
      {
        id: "consecutive3",
        type: "bar",
        addSize: 3,
        delSize: 2,
        timestampUtcMs: getOffsetTimestamp(9),
        additions: 42,
        deletions: 21,
      },
      {
        id: "consecutive4",
        type: "bar",
        addSize: 4,
        delSize: 1,
        timestampUtcMs: getOffsetTimestamp(10),
        additions: 96,
        deletions: 15,
      },
      {
        id: "consecutive5",
        type: "bar",
        addSize: 1,
        delSize: 3,
        timestampUtcMs: getOffsetTimestamp(11),
        additions: 14,
        deletions: 53,
      },
      {
        id: "consecutive6",
        type: "bar",
        addSize: 4,
        delSize: 4,
        timestampUtcMs: getOffsetTimestamp(12),
        additions: 78,
        deletions: 92,
      },
      {
        id: "divider3",
        type: "divider",
        timestampUtcMs: getOffsetTimestamp(13),
        title: "Bug Fix",
        subtitle: "Critical issue",
      },
      {
        id: "bar6",
        type: "bar",
        addSize: 1,
        delSize: 0,
        timestampUtcMs: getOffsetTimestamp(14),
        additions: 8,
        deletions: 0,
      },
      {
        id: "bar7",
        type: "bar",
        addSize: 0,
        delSize: 1,
        timestampUtcMs: getOffsetTimestamp(15),
        additions: 0,
        deletions: 3,
      },
      {
        id: "divider4",
        type: "divider",
        timestampUtcMs: getOffsetTimestamp(16),
        title: "Refactoring",
        subtitle: "Code cleanup",
      },
      {
        id: "bar8",
        type: "bar",
        addSize: 4,
        delSize: 4,
        timestampUtcMs: getOffsetTimestamp(17),
        additions: 67,
        deletions: 81,
      },
      {
        id: "bar9",
        type: "bar",
        addSize: 3,
        delSize: 1,
        timestampUtcMs: getOffsetTimestamp(18),
        additions: 56,
        deletions: 17,
      },
      {
        id: "divider5",
        type: "divider",
        timestampUtcMs: getOffsetTimestamp(19),
        title: "Version Update",
        subtitle: "Release prep",
      },
      {
        id: "bar10",
        type: "bar",
        addSize: 2,
        delSize: 3,
        timestampUtcMs: getOffsetTimestamp(20),
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
        timestampUtcMs: getOffsetTimestamp(0),
        additions: 15,
        deletions: 0,
      },
      {
        id: "bar2",
        type: "bar",
        addSize: 2,
        delSize: 1,
        timestampUtcMs: getOffsetTimestamp(1),
        additions: 27,
        deletions: 8,
      },
      {
        id: "bar3",
        type: "bar",
        addSize: 3,
        delSize: 2,
        timestampUtcMs: getOffsetTimestamp(2),
        additions: 45,
        deletions: 23,
      },
      {
        id: "bar4",
        type: "bar",
        addSize: 4,
        delSize: 3,
        timestampUtcMs: getOffsetTimestamp(3),
        additions: 89,
        deletions: 41,
      },
      {
        id: "bar5",
        type: "bar",
        addSize: 0,
        delSize: 4,
        timestampUtcMs: getOffsetTimestamp(4),
        additions: 0,
        deletions: 63,
      },
      {
        id: "bar6",
        type: "bar",
        addSize: 4,
        delSize: 4,
        timestampUtcMs: getOffsetTimestamp(5),
        additions: 72,
        deletions: 68,
      },
      {
        id: "bar7",
        type: "bar",
        addSize: 3,
        delSize: 0,
        timestampUtcMs: getOffsetTimestamp(6),
        additions: 54,
        deletions: 0,
      },
      {
        id: "bar8",
        type: "bar",
        addSize: 2,
        delSize: 3,
        timestampUtcMs: getOffsetTimestamp(7),
        additions: 32,
        deletions: 44,
      },
      {
        id: "bar9",
        type: "bar",
        addSize: 1,
        delSize: 1,
        timestampUtcMs: getOffsetTimestamp(8),
        additions: 19,
        deletions: 12,
      },
      {
        id: "bar10",
        type: "bar",
        addSize: 0,
        delSize: 0,
        timestampUtcMs: getOffsetTimestamp(9),
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
        timestampUtcMs: getOffsetTimestamp(0),
        additions: 47,
        deletions: 13,
      },
      {
        id: "divider1",
        type: "divider",
        timestampUtcMs: getOffsetTimestamp(1),
        title: "Sprint Planning",
        subtitle: "New Features",
      },
      {
        id: "bar2",
        type: "bar",
        addSize: 2,
        delSize: 2,
        timestampUtcMs: getOffsetTimestamp(2),
        additions: 28,
        deletions: 26,
      },
      {
        id: "divider2",
        type: "divider",
        timestampUtcMs: getOffsetTimestamp(3),
        title: "Task Assignment",
        subtitle: "Development",
      },
      {
        id: "bar3",
        type: "bar",
        addSize: 4,
        delSize: 0,
        timestampUtcMs: getOffsetTimestamp(4),
        additions: 65,
        deletions: 0,
      },
      {
        id: "divider3",
        type: "divider",
        timestampUtcMs: getOffsetTimestamp(5),
        title: "Code Freeze",
        subtitle: "Pre-release",
      },
      {
        id: "bar4",
        type: "bar",
        addSize: 1,
        delSize: 4,
        timestampUtcMs: getOffsetTimestamp(6),
        additions: 11,
        deletions: 59,
      },
      {
        id: "divider4",
        type: "divider",
        timestampUtcMs: getOffsetTimestamp(7),
        title: "Testing Phase",
        subtitle: "QA Review",
      },
      {
        id: "bar5",
        type: "bar",
        addSize: 3,
        delSize: 3,
        timestampUtcMs: getOffsetTimestamp(8),
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
        timestampUtcMs: getOffsetTimestamp(0),
        additions: 24,
        deletions: 29,
      },
      {
        id: "divider1",
        type: "divider",
        timestampUtcMs: getOffsetTimestamp(1),
        title: "Version Bump",
        subtitle: "v1.2.0",
      },
      {
        id: "bar2",
        type: "bar",
        addSize: 3,
        delSize: 1,
        timestampUtcMs: getOffsetTimestamp(2),
        additions: 51,
        deletions: 9,
      },
      {
        id: "divider2",
        type: "divider",
        timestampUtcMs: getOffsetTimestamp(3),
        title: "Code Review",
        subtitle: "Pull Request",
      },
      {
        id: "bar3",
        type: "bar",
        addSize: 1,
        delSize: 3,
        timestampUtcMs: getOffsetTimestamp(4),
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
        timestampUtcMs: getOffsetTimestamp(0),
        additions: 45,
        deletions: 20,
      },
      {
        id: "divider-test-1",
        type: "divider",
        timestampUtcMs: getOffsetTimestamp(1),
        title: "Debug Title",
        subtitle: "Debug Subtitle",
      },
      {
        id: "bar-test-2",
        type: "bar",
        addSize: 2,
        delSize: 1,
        timestampUtcMs: getOffsetTimestamp(2),
        additions: 25,
        deletions: 10,
      },
    ],
  },
};
