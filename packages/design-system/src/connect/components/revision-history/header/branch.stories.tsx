import { type Meta, type StoryObj } from "@storybook/react";
import { Branch } from "./branch.js";

const meta = {
  title: "Connect/Components/Revision History/Header/Branch",
  component: Branch,
} satisfies Meta<typeof Branch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
