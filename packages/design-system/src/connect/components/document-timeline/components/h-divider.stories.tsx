import { type Meta, type StoryObj } from "@storybook/react";
import { HDivider } from "./h-divider.js";

const meta = {
  title: "Connect/Components/DocumentTimeline/Components/HDivider",
  component: HDivider,
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
