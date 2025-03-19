import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { withForm } from "../../../lib/decorators.js";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
} from "../../../lib/storybook-arg-types.js";
import { TextField } from "./text-field.js";

const meta = {
  title: "Document Engineering/Fragments/TextField",
  component: TextField,
  decorators: [withForm],
  parameters: {
    layout: "centered",
    chromatic: {
      disableSnapshot: true,
    },
  },
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes(),
    ...PrebuiltArgTypes.placeholder,
    ...PrebuiltArgTypes.autoComplete,
    ...PrebuiltArgTypes.spellCheck,

    ...PrebuiltArgTypes.trim,
    ...PrebuiltArgTypes.uppercase,
    ...PrebuiltArgTypes.lowercase,

    ...getValidationArgTypes(),
    ...PrebuiltArgTypes.minLength,
    ...PrebuiltArgTypes.maxLength,
    ...PrebuiltArgTypes.pattern,
  },
  args: {
    errors: [],
    warnings: [],
    name: "text-field",
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
    placeholder: "Enter your first name",
  },
};

export const Disabled: Story = {
  args: {
    label: "Read Only Field",
    value: "This field is disabled",
    disabled: true,
    placeholder: "This field is disabled",
  },
};

export const WithError: Story = {
  args: {
    label: "Username",
    value: "jo",
    required: true,
    errors: ["Username must be at least 5 characters long"],
    placeholder: "Enter your username",
  },
};

export const WithWarning: Story = {
  args: {
    label: "Username",
    value: "LKlfnwuirenfanmdpmawef",
    warnings: ["Will you remember this?"],
    placeholder: "Enter your username",
  },
};

export const WithDefaultValue: Story = {
  args: {
    label: "Username",
    defaultValue: "johndoe",
    placeholder: "Enter your username",
  },
};

export const WithMaxLength: Story = {
  args: {
    label: "Username",
    value: "john",
    maxLength: 10,
    placeholder: "Enter your username",
  },
};

export const WithLowercase: Story = {
  args: {
    label: "Username",
    value: "JohnDOE123",
    lowercase: true,
    placeholder: "Enter your username",
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
    placeholder: "Enter your username",
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
    placeholder: "Enter your username",
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
