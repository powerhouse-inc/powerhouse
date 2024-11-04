import type { Meta, StoryObj } from "@storybook/react";
import { ToggleField } from "./toggle-field";
import { withForm } from "@/scalars/lib/decorators";

const meta: Meta<typeof ToggleField> = {
  title: "Document Engineering/Fragments/Toggle Field",
  tags: ["autodocs"],
  component: ToggleField,
  decorators: [withForm],
  argTypes: {
    value: {
      control: "boolean",
      description: "Indicates if the toggle is checked",
    },
    defaultValue: {
      control: "boolean",
      description: "Default value for the toggle",
    },
    disabled: {
      control: "boolean",
      description: "Indicates if the toggle is disabled",
      table: { defaultValue: { summary: "false" } },
    },
    label: {
      control: "text",
      description: "Label for the toggle",
    },
    description: {
      control: "text",
      description: "Description for the toggle",
    },
    errors: {
      control: "object",
      description: "Array of error objects to display",
      table: { defaultValue: { summary: "[]" } },
    },
    warnings: {
      control: "object",
      description: "Array of warning objects to display",
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
    },
    onChange: {
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
  args: {
    name: "toggle",
    errors: [],
    warnings: [],
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: true,
  },
};

export const CheckedWithLabel: Story = {
  name: "Checked with label",
  args: {
    value: true,
    label: "Active",
  },
};

export const Unchecked: Story = {
  name: "Unchecked without label",
  args: {
    value: false,
  },
};

export const UncheckedWithLabel: Story = {
  name: "Unchecked with label",
  args: {
    value: false,
    label: "Active",
  },
};

export const DisabledChecked: Story = {
  name: "Disabled checked without label",
  args: {
    value: true,
    disabled: true,
  },
};

export const DisabledCheckedWithLabel: Story = {
  name: "Disabled checked with label",
  args: {
    disabled: true,
    value: true,
    label: "Active",
  },
};

export const DisabledUncheckedWithoutLabel: Story = {
  name: "Disabled unchecked without label",
  args: {
    value: false,
    disabled: true,
  },
};

export const DisabledUncheckedWithLabel: Story = {
  name: "Disabled unchecked with label",
  args: {
    disabled: true,
    value: false,
    label: "Active",
  },
};
