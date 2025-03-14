import type { Meta, StoryObj } from "@storybook/react";
import { FormLabel } from "./form-label.js";

const meta: Meta<typeof FormLabel> = {
  title: "Document Engineering/Fragments/FormLabel",
  component: FormLabel,
  parameters: {
    chromatic: {
      disableSnapshot: true,
    },
  },
  tags: ["autodocs"],
  argTypes: {
    required: {
      control: {
        type: "boolean",
      },
      description: "Whether the field is required",
    },
    description: {
      control: {
        type: "text",
      },
      description: "Tooltip text that appears when hovering over the info icon",
    },
    hasError: {
      control: {
        type: "boolean",
      },
      description: "Whether the label should show error styling",
    },
    disabled: {
      control: {
        type: "boolean",
      },
      description: "Whether the label is disabled",
    },
    className: {
      control: {
        type: "text",
      },
      description: "Additional CSS classes to apply to the label",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: "Hello, World!",
  },
};

export const WithDescription: Story = {
  args: {
    children: "Hello, World!",
    description: "This is a description",
  },
};

export const WithError: Story = {
  args: {
    children: "Hello, World!",
    hasError: true,
  },
};

export const Disabled: Story = {
  args: {
    children: "Hello, World!",
    disabled: true,
  },
};

export const Required: Story = {
  args: {
    children: "Hello, World!",
    required: true,
  },
};
