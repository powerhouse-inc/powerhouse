import { Meta, StoryObj } from "@storybook/react";
import { Scope } from "./scope";

const meta = {
  title: "Connect/Components/Revision History/Header/Scope",
  component: Scope,
} satisfies Meta<typeof Scope>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: "global",
    onChange: () => {},
  },
};
