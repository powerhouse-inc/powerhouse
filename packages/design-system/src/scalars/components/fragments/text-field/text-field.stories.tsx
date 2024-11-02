import type { Meta, StoryObj } from "@storybook/react";
import { TextField } from "./text-field";

const meta = {
  title: "Document Engineering/Fragments/TextField",
  component: TextField,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    label: {
      control: "text",
    },
    description: {
      control: "text",
    },
    value: {
      control: "text",
    },
    required: {
      control: "boolean",
    },
    disabled: {
      control: "boolean",
    },
    placeholder: {
      control: "text",
    },
    errors: {
      control: "object",
    },
    warnings: {
      control: "object",
    },
  },
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Text Input",
    placeholder: "Type something...",
  },
};

export const WithDescription: Story = {
  args: {
    label: "Username",
    description: "You will need this to log in to your account.",
    placeholder: "johndoe",
  },
};

export const Required: Story = {
  args: {
    label: "Username",
    required: true,
    placeholder: "johndoe",
  },
};

export const WithValue: Story = {
  args: {
    label: "First Name",
    value: "John",
  },
};

export const Disabled: Story = {
  args: {
    label: "Read Only Field",
    value: "This field is disabled",
    disabled: true,
  },
};

export const WithError: Story = {
  args: {
    label: "Username",
    value: "jo",
    required: true,
    errors: ["Username must be at least 5 characters long"],
  },
};

export const WithWarning: Story = {
  args: {
    label: "Username",
    value: "LKlfnwuirenfanmdpmawef",
    warnings: ["Will you remember this?"],
  },
};

export const WithDefaultValue: Story = {
  args: {
    label: "Username",
    default: "johndoe",
    placeholder: "Enter username",
  },
};
