import type { Meta, StoryObj } from "@storybook/react";
import { StringField } from "./string-field";
import { withForm } from "@/scalars/lib/decorators";

const meta = {
  title: "Document Engineering/Simple Components/String Field",
  component: StringField,
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
    multiline: {
      control: "boolean",
      description: "Whether to render as a multi-line textarea",
    },
    autoExpand: {
      control: "boolean",
      description:
        "Whether textarea should automatically expand as content grows",
    },
    minLength: {
      control: "number",
      description: "Minimum number of characters allowed",
    },
    maxLength: {
      control: "number",
      description: "Maximum number of characters allowed",
    },
    pattern: {
      control: "text",
      description: "Regular expression pattern to validate input",
    },
    trim: {
      control: "boolean",
      description: "Whether to trim whitespace from input",
    },
    uppercase: {
      control: "boolean",
      description: "Whether to transform input to uppercase",
    },
    lowercase: {
      control: "boolean",
      description: "Whether to transform input to lowercase",
    },
    autoComplete: {
      control: "text",
      description: "HTML autocomplete attribute value",
    },
    spellCheck: {
      control: "boolean",
      description: "Whether to enable browser spell checking",
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
    name: "string-field",
  },
} satisfies Meta<typeof StringField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "String Input",
    placeholder: "Type something...",
  },
};

export const WithDescription: Story = {
  args: {
    label: "Bio",
    description: "Tell us a little bit about yourself",
    placeholder: "I am a...",
  },
};

export const Required: Story = {
  args: {
    label: "Full Name",
    required: true,
    placeholder: "John Doe",
  },
};

export const WithValue: Story = {
  args: {
    label: "Email",
    value: "john.doe@example.com",
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
    label: "Password",
    value: "123",
    required: true,
    errors: ["Password must be at least 8 characters long"],
  },
};

export const WithWarning: Story = {
  args: {
    label: "Password",
    value: "password123",
    warnings: ["Consider using a stronger password"],
  },
};

export const Multiline: Story = {
  args: {
    label: "Comments",
    multiline: true,
    placeholder: "Enter your comments here...",
    autoExpand: true,
  },
};

export const WithDefaultValue: Story = {
  args: {
    label: "Favorite Color",
    defaultValue: "Blue",
    placeholder: "Enter your favorite color",
  },
};
