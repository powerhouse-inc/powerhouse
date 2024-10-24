import { Meta, StoryObj } from "@storybook/react";
import { Checkbox } from "./checkbox";

const meta: Meta<typeof Checkbox> = {
  component: Checkbox,
  title: "Document Engineering/Simple Components/Checkbox",
  argTypes: {
    checked: {
      control: "boolean",
      description: "Whether the checkbox is checked",
    },
    disabled: {
      control: "boolean",
      description: "Whether the checkbox is disabled",
    },
    onCheckedChange: {
      action: "checked changed",
      description: "Callback when the checked state changes",
    },
    className: {
      control: "text",
      description: "Additional CSS class names",
    },
  },
};

export default meta;

type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {
  args: {
    checked: false,
    disabled: false,
  },
};

export const Checked: Story = {
  args: {
    checked: true,
    disabled: false,
  },
};

export const Disabled: Story = {
  args: {
    checked: false,
    disabled: true,
  },
};

export const CheckedAndDisabled: Story = {
  args: {
    checked: true,
    disabled: true,
  },
};
