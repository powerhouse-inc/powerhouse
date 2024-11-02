import type { Meta, StoryObj } from "@storybook/react";
import { TextField } from "./text-field";
import { useState } from "react";

const meta = {
  title: "Document Engineering/Fragments/TextField",
  component: TextField,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    name: {
      control: "text",
      description: "Name attribute for the input field",
    },
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
      description: "Controlled value of the input field",
    },
    required: {
      control: "boolean",
      description: "Whether the field is required",
    },
    disabled: {
      control: "boolean",
      description: "Whether the input field is disabled",
    },
    placeholder: {
      control: "text",
      description: "Placeholder text shown when field is empty",
    },
    minLength: {
      control: "number",
      description: "Minimum number of characters allowed",
    },
    maxLength: {
      control: "number",
      description: "Maximum number of characters allowed",
    },
    autoComplete: {
      control: "boolean",
      description: "AutoComplete attribute for the input field",
    },
    spellCheck: {
      control: "boolean",
      description: "SpellCheck attribute for the input field",
    },
    errors: {
      control: "object",
      description: "Array of error messages to display below the field",
    },
    warnings: {
      control: "object",
      description: "Array of warning messages to display below the field",
    },
  },
  args: {
    errors: [],
    warnings: [],
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
    defaultValue: "johndoe",
    placeholder: "Enter username",
  },
};

export const WithMaxLength: Story = {
  args: {
    label: "Username",
    value: "john",
    maxLength: 10,
  },
};

export const WithLowercase: Story = {
  args: {
    label: "Username",
    value: "JohnDOE123",
    lowercase: true,
  },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);

    return (
      <TextField
        {...args}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  },
};

export const WithUppercase: Story = {
  args: {
    label: "Username",
    value: "JohnDoe123",
    uppercase: true,
  },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);

    return (
      <TextField
        {...args}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  },
};

export const WithTrim: Story = {
  args: {
    label: "Username",
    value: "   john doe   ",
    trim: true,
  },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);

    return (
      <TextField
        {...args}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  },
};
