import { ConnectTooltipProvider } from "@powerhousedao/design-system";
import type { Meta, StoryObj } from "@storybook/react";
import { HDivider } from "./h-divider.js";

// Get a timestamp from the past (3 months ago)
const getPastTimestamp = () => {
  const date = new Date();
  date.setMonth(date.getMonth() - 3);
  return date.toISOString();
};

const meta = {
  title: "Connect/Components/DocumentTimeline/Components/HDivider",
  component: HDivider,
  decorators: [
    (Story) => (
      <ConnectTooltipProvider delayDuration={0} skipDelayDuration={0}>
        <Story />
      </ConnectTooltipProvider>
    ),
  ],
} satisfies Meta<typeof HDivider>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const WithCustomClass: Story = {
  args: {
    className: "bg-gray-100",
  },
};

export const WithTimestamp: Story = {
  args: {
    timestampUtcMs: getPastTimestamp(),
  },
};

export const WithAtlasDocumentTitle: Story = {
  args: {
    title: "Atlas Document",
    subtitle: "Created",
    timestampUtcMs: getPastTimestamp(),
  },
};

export const WithRatifiedDocumentTitle: Story = {
  args: {
    title: "Ratified Atlas Document",
    subtitle: "Created",
    timestampUtcMs: getPastTimestamp(),
  },
};

export const Selected: Story = {
  args: {
    isSelected: true,
    title: "Atlas Document",
    subtitle: "Created",
    timestampUtcMs: getPastTimestamp(),
  },
};

export const SelectedWithRatified: Story = {
  args: {
    isSelected: true,
    title: "Ratified Atlas Document",
    subtitle: "Created",
    timestampUtcMs: getPastTimestamp(),
  },
};
