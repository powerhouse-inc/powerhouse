import type { Meta, StoryObj } from "@storybook/react";
import { ToggleField } from "./toggle-field";

const meta: Meta<typeof ToggleField> = {
  title: "Document Engineering/Simple Components/Toggle",
  tags: ["autodocs"],
  component: ToggleField,
  argTypes: {
    checked: {
      control: "boolean",
      description: "Indicates if the toggle is checked",
      defaultValue: true,
    },
    disabled: {
      control: "boolean",
      description: "Indicates if the toggle is disabled",
      defaultValue: false,
    },
    label: {
      control: "text",
      description: "Label for the toggle",
    },
    errors: {
      control: "object",
      description: "Array of error objects to display",
      defaultValue: [],
    },
    required: {
      control: "boolean",
      description: "Indicates if the toggle is required",
      defaultValue: false,
    },
    className: {
      control: "text",
      description: "Additional CSS classes for styling",
    },
    onCheckedChange: {
      action: "checked changed",
      description: "Callback when the checked state changes",
    },
    name: {
      control: "text",
      description: "Name attribute for the toggle input",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    checked: false,
    disabled: false,
    label: "",
    errors: [],
    required: false,
    className: "",
  },
};

export const Checked: Story = {
  args: {
    checked: true,
  },
};

export const DisabledChecked: Story = {
  args: {
    checked: true,
    disabled: true,
  },
};

export const DisabledUnChecked: Story = {
  name: "Disabled Unchecked",
  args: {
    disabled: true,
    checked: false,
  },
};
