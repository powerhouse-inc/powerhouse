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
      table: { defaultValue: { summary: "true" } },
    },
    disabled: {
      control: "boolean",
      description: "Indicates if the toggle is disabled",
      table: { defaultValue: { summary: "false" } },
    },
    label: {
      control: "text",
      description: "Label for the toggle",
      table: { defaultValue: { summary: "" } },
    },
    errors: {
      control: "object",
      description: "Array of error objects to display",
      table: { defaultValue: { summary: "[]" } },
    },
    required: {
      control: "boolean",
      description: "Indicates if the toggle is required",
      table: { defaultValue: { summary: "false" } },
    },
    className: {
      control: "text",
      description: "Additional CSS classes for styling",
      table: { defaultValue: { summary: "" } },
    },
    onCheckedChange: {
      action: "checked changed",
      description: "Callback when the checked state changes",
      table: {
        type: { summary: "(checked: boolean) => void" },
      },
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
    checked: true,
    disabled: false,
    label: "",
    errors: [],
    required: false,
    className: "",
    name: "",
  },
};

export const CheckedWithLabel: Story = {
  name: "Checked with label",
  args: {
    checked: true,
    label: "Active",
    errors: [],
  },
};

export const Unchecked: Story = {
  name: "Unchecked without label",
  args: {
    checked: false,
    errors: [],
  },
};

export const UncheckedWithLabel: Story = {
  name: "Unchecked with label",
  args: {
    checked: false,
    label: "Active",
    errors: [],
  },
};

export const DisabledChecked: Story = {
  name: "Disabled checked without label",
  args: {
    checked: true,
    disabled: true,
    errors: [],
  },
};

export const DisabledCheckedWithLabel: Story = {
  name: "Disabled checked with label",
  args: {
    disabled: true,
    checked: true,
    label: "Active",
    errors: [],
  },
};

export const DisabledUncheckedWithoutLabel: Story = {
  name: "Disabled unchecked without label",
  args: {
    checked: false,
    disabled: true,
    errors: [],
  },
};

export const DisabledUncheckedWithLabel: Story = {
  name: "Disabled unchecked with label",
  args: {
    disabled: true,
    checked: false,
    label: "Active",
    errors: [],
  },
};
