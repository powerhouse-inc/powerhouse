import { type Meta, type StoryObj } from "@storybook/react";
import { addHours } from "date-fns";
import { DocumentTimeline } from "./document-timeline.js";

const meta = {
  title: "Connect/Components/DocumentTimeline",
  component: DocumentTimeline,
} satisfies Meta<typeof DocumentTimeline>;

export default meta;

type Story = StoryObj<typeof meta>;

// Generate timestamps with 1 hour difference starting from a base date
const generateTimestamps = (count: number) => {
  const baseDate = new Date("2025-04-15T10:00:00.000Z");
  return Array.from({ length: count }, (_, i) =>
    addHours(baseDate, i).toISOString(),
  );
};

export const Default: Story = {
  args: {
    timeline: [
      {
        id: "bar1",
        type: "bar",
        addSize: 2,
        delSize: 1,
        timestamp: "2025-04-15T10:00:00.000Z",
        additions: 25,
        deletions: 12,
      },
      { id: "divider1", type: "divider" },
      {
        id: "bar2",
        type: "bar",
        addSize: 4,
        delSize: 0,
        timestamp: "2025-04-15T12:00:00.000Z",
        additions: 87,
        deletions: 0,
      },
      {
        id: "bar3",
        type: "bar",
        addSize: 1,
        delSize: 3,
        timestamp: "2025-04-15T13:00:00.000Z",
        additions: 10,
        deletions: 45,
      },
      { id: "divider2", type: "divider" },
      {
        id: "bar4",
        type: "bar",
        addSize: 3,
        delSize: 2,
        timestamp: "2025-04-15T15:00:00.000Z",
        additions: 52,
        deletions: 24,
      },
      {
        id: "bar5",
        type: "bar",
        addSize: 2,
        delSize: 2,
        timestamp: "2025-04-15T16:00:00.000Z",
        additions: 38,
        deletions: 29,
      },
      {
        id: "consecutive1",
        type: "bar",
        addSize: 1,
        delSize: 4,
        timestamp: "2025-04-15T17:00:00.000Z",
        additions: 18,
        deletions: 76,
      },
      {
        id: "consecutive2",
        type: "bar",
        addSize: 2,
        delSize: 3,
        timestamp: "2025-04-15T18:00:00.000Z",
        additions: 35,
        deletions: 47,
      },
      {
        id: "consecutive3",
        type: "bar",
        addSize: 3,
        delSize: 2,
        timestamp: "2025-04-15T19:00:00.000Z",
        additions: 42,
        deletions: 21,
      },
      {
        id: "consecutive4",
        type: "bar",
        addSize: 4,
        delSize: 1,
        timestamp: "2025-04-15T20:00:00.000Z",
        additions: 96,
        deletions: 15,
      },
      {
        id: "consecutive5",
        type: "bar",
        addSize: 1,
        delSize: 3,
        timestamp: "2025-04-15T21:00:00.000Z",
        additions: 14,
        deletions: 53,
      },
      {
        id: "consecutive6",
        type: "bar",
        addSize: 4,
        delSize: 4,
        timestamp: "2025-04-15T22:00:00.000Z",
        additions: 78,
        deletions: 92,
      },
      { id: "divider3", type: "divider" },
      {
        id: "bar6",
        type: "bar",
        addSize: 1,
        delSize: 0,
        timestamp: "2025-04-16T00:00:00.000Z",
        additions: 8,
        deletions: 0,
      },
      {
        id: "bar7",
        type: "bar",
        addSize: 0,
        delSize: 1,
        timestamp: "2025-04-16T01:00:00.000Z",
        additions: 0,
        deletions: 3,
      },
      { id: "divider4", type: "divider" },
      {
        id: "bar8",
        type: "bar",
        addSize: 4,
        delSize: 4,
        timestamp: "2025-04-16T03:00:00.000Z",
        additions: 67,
        deletions: 81,
      },
      {
        id: "bar9",
        type: "bar",
        addSize: 3,
        delSize: 1,
        timestamp: "2025-04-16T04:00:00.000Z",
        additions: 56,
        deletions: 17,
      },
      { id: "divider5", type: "divider" },
      {
        id: "bar10",
        type: "bar",
        addSize: 2,
        delSize: 3,
        timestamp: "2025-04-16T06:00:00.000Z",
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
        timestamp: "2025-04-15T10:00:00.000Z",
        additions: 15,
        deletions: 0,
      },
      {
        id: "bar2",
        type: "bar",
        addSize: 2,
        delSize: 1,
        timestamp: "2025-04-15T11:00:00.000Z",
        additions: 27,
        deletions: 8,
      },
      {
        id: "bar3",
        type: "bar",
        addSize: 3,
        delSize: 2,
        timestamp: "2025-04-15T12:00:00.000Z",
        additions: 45,
        deletions: 23,
      },
      {
        id: "bar4",
        type: "bar",
        addSize: 4,
        delSize: 3,
        timestamp: "2025-04-15T13:00:00.000Z",
        additions: 89,
        deletions: 41,
      },
      {
        id: "bar5",
        type: "bar",
        addSize: 0,
        delSize: 4,
        timestamp: "2025-04-15T14:00:00.000Z",
        additions: 0,
        deletions: 63,
      },
      {
        id: "bar6",
        type: "bar",
        addSize: 4,
        delSize: 4,
        timestamp: "2025-04-15T15:00:00.000Z",
        additions: 72,
        deletions: 68,
      },
      {
        id: "bar7",
        type: "bar",
        addSize: 3,
        delSize: 0,
        timestamp: "2025-04-15T16:00:00.000Z",
        additions: 54,
        deletions: 0,
      },
      {
        id: "bar8",
        type: "bar",
        addSize: 2,
        delSize: 3,
        timestamp: "2025-04-15T17:00:00.000Z",
        additions: 32,
        deletions: 44,
      },
      {
        id: "bar9",
        type: "bar",
        addSize: 1,
        delSize: 1,
        timestamp: "2025-04-15T18:00:00.000Z",
        additions: 19,
        deletions: 12,
      },
      {
        id: "bar10",
        type: "bar",
        addSize: 0,
        delSize: 0,
        timestamp: "2025-04-15T19:00:00.000Z",
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
        timestamp: "2025-04-15T10:00:00.000Z",
        additions: 47,
        deletions: 13,
      },
      { id: "divider1", type: "divider" },
      {
        id: "bar2",
        type: "bar",
        addSize: 2,
        delSize: 2,
        timestamp: "2025-04-15T12:00:00.000Z",
        additions: 28,
        deletions: 26,
      },
      { id: "divider2", type: "divider" },
      {
        id: "bar3",
        type: "bar",
        addSize: 4,
        delSize: 0,
        timestamp: "2025-04-15T14:00:00.000Z",
        additions: 65,
        deletions: 0,
      },
      { id: "divider3", type: "divider" },
      {
        id: "bar4",
        type: "bar",
        addSize: 1,
        delSize: 4,
        timestamp: "2025-04-15T16:00:00.000Z",
        additions: 11,
        deletions: 59,
      },
      { id: "divider4", type: "divider" },
      {
        id: "bar5",
        type: "bar",
        addSize: 3,
        delSize: 3,
        timestamp: "2025-04-15T18:00:00.000Z",
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
        timestamp: "2025-04-15T10:00:00.000Z",
        additions: 24,
        deletions: 29,
      },
      { id: "divider1", type: "divider" },
      {
        id: "bar2",
        type: "bar",
        addSize: 3,
        delSize: 1,
        timestamp: "2025-04-15T12:00:00.000Z",
        additions: 51,
        deletions: 9,
      },
      { id: "divider2", type: "divider" },
      {
        id: "bar3",
        type: "bar",
        addSize: 1,
        delSize: 3,
        timestamp: "2025-04-15T14:00:00.000Z",
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
