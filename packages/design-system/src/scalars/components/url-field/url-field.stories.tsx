import type { Meta, StoryObj } from "@storybook/react";
import { UrlField } from "./url-field";
import { withForm } from "@/scalars/lib/decorators";

const meta: Meta<typeof UrlField> = {
  title: "Document Engineering/Simple Components/URL Field",
  component: UrlField,
  decorators: [withForm],
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    label: {
      control: "text",
      description: "Label text displayed above the input field",
    },
    description: {
      control: "text",
      description: "Helper text displayed below the input field",
    },
    value: {
      control: "text",
      description: "Current value of the input field",
    },
    required: {
      control: "boolean",
      description: "Whether the field is required",
    },
    disabled: {
      control: "boolean",
      description: "Whether the field is disabled",
    },
    placeholder: {
      control: "text",
      description: "Placeholder text shown when field is empty",
    },
    allowedProtocols: {
      control: "object",
      description: "Allowed protocols for the URL",
      table: {
        defaultValue: { summary: "['http', 'https']" },
      },
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
    name: "url-field",
    allowedProtocols: ["https"],
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Website URL",
    placeholder: "https://example.com",
  },
};

export const WithDescription: Story = {
  args: {
    label: "Forum URL",
    description: "Enter the URL to your online forum",
    placeholder: "https://myforum.com",
  },
};

export const Required: Story = {
  args: {
    label: "LinkedIn",
    required: true,
    placeholder: "https://linkedin.com/in/username",
  },
};

export const WithValue: Story = {
  args: {
    label: "With Value",
    value: "https://exaomple.com",
  },
};

export const Disabled: Story = {
  args: {
    label: "Read Only URL",
    value: "https://example.com",
    disabled: true,
  },
};

export const WithError: Story = {
  args: {
    label: "Website URL",
    value: "not-a-valid-url",
    errors: ["Please enter a valid URL"],
  },
};

export const WithWarning: Story = {
  args: {
    label: "Website URL",
    value: "https://example.com",
    warnings: ["URL may be unreachable"],
  },
};
