import type { Meta, StoryObj } from "@storybook/react";
import { Toggle } from "./toggle";

const meta: Meta<typeof Toggle> = {
  title: "Document Engineering/Simple Components/Toggle",
  component: Toggle,
  argTypes: {
    defaultChecked: {
      control: {
        type: "boolean",
      },
    },
    disabled: {
      control: {
        type: "boolean",
      },
    },
    className: {
      control: {
        type: "text",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const Checked: Story = {
  args: {
    defaultChecked: true,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const DisabledChecked: Story = {
  args: {
    disabled: true,
    defaultChecked: true,
  },
};
