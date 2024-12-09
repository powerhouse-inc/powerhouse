import type { Meta, StoryObj } from "@storybook/react";
import { TextField } from "./text-field";
import { useState } from "react";
import { withForm } from "@/scalars/lib/decorators";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
} from "@/scalars/lib/storybook-arg-types";

const meta = {
  title: "Document Engineering/Fragments/TextField",
  component: TextField,
  decorators: [withForm],
  parameters: {
    layout: "centered",
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
