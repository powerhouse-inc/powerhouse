import { Meta, StoryObj } from "@storybook/react";
import { CheckboxField } from "./checkbox-field";

const meta: Meta<typeof CheckboxField> = {
  component: CheckboxField,
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
  },
};

export default meta;

type Story = StoryObj<typeof CheckboxField>;

export const Default: Story = {
  args: {
    checked: false,
    disabled: false,
    label: "Default Checkbox",
  },
};

export const Checked: Story = {
  args: {
    checked: true,
    disabled: false,
    label: "Checked Checkbox",
  },
};

export const Disabled: Story = {
  args: {
    checked: false,
    disabled: true,
    label: "Disabled Checkbox",
  },
};

export const CheckedAndDisabled: Story = {
  args: {
    checked: true,
    disabled: true,
    label: "Checked and Disabled Checkbox",
  },
};

export const Required: Story = {
  args: {
    checked: false,
    required: true,
    label: "Required Checkbox",
  },
};

export const WithDescription: Story = {
  args: {
    checked: false,
    description: "This is a description",
    label: "Checkbox with description",
  },
};

export const RequiredWithDescription: Story = {
  args: {
    checked: false,
    description: "This is a description",
    label: "Required Checkbox with description",
    required: true,
  },
};

export const WithCustomLabel: Story = {
  args: {
    checked: false,
    label: (
      <span>
        I agree to the{" "}
        <a
          className="underline"
          href="https://originui.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          terms of service
        </a>
      </span>
    ),
  },
};
