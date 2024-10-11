import { Meta, StoryObj } from "@storybook/react";
import { Timestamp } from "./timestamp";

const meta = {
  title: "Connect/Components/Revision History/Revision/Timestamp",
  component: Timestamp,
} satisfies Meta<typeof Timestamp>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    timestamp: 1719232415114,
  },
};
