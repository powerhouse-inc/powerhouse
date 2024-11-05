import type { Meta, StoryObj } from "@storybook/react";
import { BooleanField } from "./boolean-field";
import { withForm } from "@/scalars/lib/decorators";

const meta = {
  title: "Document Engineering/Simple Components/Boolean Field",
  component: BooleanField,
  decorators: [withForm],
  argTypes: {
    isToggle: {
      control: "boolean",
      description: "Whether the field is a toggle",
      table: { defaultValue: { summary: "false" } },
    },
    id: {
      control: "text",
      description: "Unique identifier for the field",
    },
    name: {
      control: "text",
      description: "Name attribute for the field",
    },
    label: {
      control: "text",
      description: "Label for the field",
    },
    description: {
      control: "text",
      description: "Description text below the label",
    },
    value: {
      control: "boolean",
      description: "Current value of the field",
    },
    defaultValue: {
      control: "boolean",
      description: "Default value for the field",
    },
    required: {
      control: "boolean",
      description: "Whether the field is required",
      table: { defaultValue: { summary: "false" } },
    },
    disabled: {
      control: "boolean",
      description: "Whether the field is disabled",
      table: { defaultValue: { summary: "false" } },
    },
    errors: {
      control: "object",
      description: "Array of error messages to display",
      table: { defaultValue: { summary: "[]" } },
    },
    warnings: {
      control: "object",
      description: "Array of warning messages to display",
      table: { defaultValue: { summary: "[]" } },
    },
    className: {
      control: "text",
      description: "Additional CSS class names",
    },
  },
  args: {
    name: "boolean-field",
  },
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A boolean field component that can be used as a [checkbox](?path=/docs/document-engineering-fragments-checkbox-field--readme) or [toggle](?path=/docs/document-engineering-fragments-toggle-field--readme) depending on the `isToggle` prop.",
      },
    },
  },
} satisfies Meta<typeof BooleanField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Checkbox: Story = {
  args: {
    label: "Checkbox Field",
    description: "This is a checkbox field",
    isToggle: false,
  },
};

export const Toggle: Story = {
  args: {
    label: "Toggle Field",
    description: "This is a toggle field",
    isToggle: true,
  },
};
