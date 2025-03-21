import { Icon } from "#powerhouse";
import type { Meta, StoryObj } from "@storybook/react";
import { RWAButton } from "./button.js";

const meta: Meta<typeof RWAButton> = {
  title: "RWA/Components/RWAButton",
  component: RWAButton,
  argTypes: {
    children: { control: "text" },
    icon: { control: "object" },
    iconPosition: {
      options: ["left", "right"],
      control: { type: "radio" },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    children: "Edit Transaction",
    iconPosition: "right",
    icon: <Icon name="Pencil" size={16} />,
  },
};
