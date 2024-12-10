import type { Meta, StoryObj } from "@storybook/react";
import { StringField } from "./string-field";
import { withForm } from "@/scalars/lib/decorators";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
} from "@/scalars/lib/storybook-arg-types";

const meta: Meta<typeof StringField> = {
  title: "Document Engineering/Simple Components/String Field",
  component: StringField,
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

    multiline: {
      control: "boolean",
      description: "Whether to render as a multi-line textarea",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    autoExpand: {
      control: "boolean",
      description:
        "Whether textarea should automatically expand as content grows",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    ...PrebuiltArgTypes.trim,
    ...PrebuiltArgTypes.uppercase,
    ...PrebuiltArgTypes.lowercase,

    ...getValidationArgTypes(),
    ...PrebuiltArgTypes.minLength,
    ...PrebuiltArgTypes.maxLength,
    ...PrebuiltArgTypes.pattern,
  },
  args: {
    name: "string-field",
  },
};

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
    label: "Username",
    value: "123",
    required: true,
    errors: ["Username must be at least 8 characters long"],
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
