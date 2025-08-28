import { TooltipProvider } from "@powerhousedao/design-system";
import type { Meta, StoryObj } from "@storybook/react";
import { TimelineBar } from "./timeline-bar.js";

const meta = {
  title: "Connect/Components/DocumentTimeline/Components/TimelineBar",
  component: TimelineBar,
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof TimelineBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    addSize: 2,
    delSize: 1,
    timestampUtcMs: "2025-04-15T21:32:35.688Z",
    additions: 10,
    deletions: 10,
  },
};

export const NoChanges: Story = {
  args: {
    addSize: 0,
    delSize: 0,
    timestampUtcMs: "2025-04-15T18:30:00.000Z",
    additions: 0,
    deletions: 0,
  },
};

export const LargeAddition: Story = {
  args: {
    addSize: 4,
    delSize: 0,
    timestampUtcMs: "2025-04-16T10:45:22.123Z",
    additions: 50,
    deletions: 0,
  },
};

export const LargeDeletion: Story = {
  args: {
    addSize: 0,
    delSize: 4,
    timestampUtcMs: "2025-04-17T14:20:15.456Z",
    additions: 0,
    deletions: 45,
  },
};

export const BalancedChanges: Story = {
  args: {
    addSize: 3,
    delSize: 3,
    timestampUtcMs: "2025-04-18T09:15:30.789Z",
    additions: 25,
    deletions: 25,
  },
};
