import { Meta, StoryObj } from "@storybook/react";
import { CheckboxField } from "./checkbox-field";
import { withForm } from "@/scalars/lib/decorators";

const meta: Meta<typeof CheckboxField> = {
  component: CheckboxField,
  title: "Document Engineering/Fragments/Checkbox Field",
  tags: ["autodocs"],
  decorators: [withForm],
  argTypes: {
    value: {
      control: "boolean",
      description: "Whether the checkbox is checked",
    },
    disabled: {
      control: "boolean",
      description: "Whether the checkbox is disabled",
    },
    onChange: {
      action: "checked changed",
      description: "Callback when the checked state changes",
    },
    className: {
      control: "text",
      description: "Additional CSS class names",
    },
    label: {
      control: "text",
      description: "Label for the checkbox",
    },
    required: {
      control: "boolean",
      description: "Whether the checkbox is required",
      table: {
        defaultValue: { summary: "false" },
      },
    },
    description: {
      control: "text",
      description: "Additional description text below the label",
    },
    errors: {
      control: "object",
      description: "Array of error messages to display",
    },
    warnings: {
      control: "object",
      description: "Array of warning messages to display",
    },
  },
  args: {
    errors: [],
    warnings: [],
    name: "checkbox",
  },
};

export default meta;

type Story = StoryObj<typeof CheckboxField>;

export const Default: Story = {
  args: {
    value: false,
    disabled: false,
    label: "Default Checkbox",
  },
};

export const Checked: Story = {
  args: {
    value: true,
    label: "Checked Checkbox",
  },
};

export const Indeterminate: Story = {
  args: {
    value: undefined,
    label: "Indeterminate Checkbox",
  },
};

export const Disabled: Story = {
  args: {
    value: false,
    disabled: true,
    label: "Disabled Checkbox",
  },
};

export const CheckedAndDisabled: Story = {
  args: {
    value: true,
    disabled: true,
    label: "Checked and Disabled Checkbox",
  },
};

export const Required: Story = {
  args: {
    value: false,
    required: true,
    label: "Required Checkbox",
  },
};

export const WithDescription: Story = {
  args: {
    value: false,
    description: "This is a description",
    label: "Checkbox with description",
  },
};

export const RequiredWithDescription: Story = {
  args: {
    value: false,
    description: "This is a description",
    label: "Required Checkbox with description",
    required: true,
  },
};

export const WithCustomLabel: Story = {
  args: {
    value: false,
    label: (
      <span>
        I agree to the{" "}
        <a
          className="underline"
          href="https://google.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          terms of service
        </a>
      </span>
    ),
  },
};

export const WithErrors: Story = {
  args: {
    value: false,
    label: "Checkbox with Errors",
    errors: ["This field is required", "Another error"],
  },
};

export const WithWarningsAndErrors: Story = {
  args: {
    value: false,
    label: "Checkbox with Warnings and Errors",
    warnings: ["This is a warning", "Another warning"],
    errors: ["This is an error", "Another error"],
  },
};