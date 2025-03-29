import type { Meta, StoryObj } from "@storybook/react";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
} from "../../../../scalars/lib/storybook-arg-types.js";
import { Textarea } from "./textarea.js";

/**
 * The `Textarea` component provides a multi-line text input field with various features.
 * It supports labels, descriptions, validation states, and text transformations.
 * It also includes auto-expansion capabilities and character counting.
 *
 * > **Note:** This component does not have built-in validation. If you need built-in validation
 * > you can use the [StringField](?path=/docs/document-engineering-scalars-string-field--readme)
 * > component.
 */
const meta = {
  title: "Document Engineering/Data Entry/Textarea",
  component: Textarea,
  parameters: {
    layout: "centered",
    chromatic: {
      disableSnapshot: true,
    },
  },
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes({
      enabledArgTypes: {
        id: false,
      },
      valueControlType: "text",
      valueType: "string",
    }),
    ...PrebuiltArgTypes.placeholder,
    ...PrebuiltArgTypes.autoComplete,
    ...PrebuiltArgTypes.spellCheck,
    ...PrebuiltArgTypes.trim,
    ...PrebuiltArgTypes.uppercase,
    ...PrebuiltArgTypes.lowercase,

    ...getValidationArgTypes({
      enabledArgTypes: {
        validators: false,
        showErrorOnBlur: false,
        showErrorOnChange: false,
      },
    }),
    ...PrebuiltArgTypes.minLength,
    ...PrebuiltArgTypes.maxLength,
    autoExpand: {
      control: "boolean",
      description:
        "Whether the textarea should automatically expand with content",
    },
    multiline: {
      control: "boolean",
      description: "Whether the textarea allows multiple lines of text",
    },
    rows: {
      control: "number",
      description: "Number of visible text lines",
    },
  },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Comments",
    placeholder: "Enter your comments",
    rows: 3,
  },
};

export const WithValue: Story = {
  args: {
    label: "Comments",
    defaultValue:
      "This is some sample text that appears in the textarea by default.",
    placeholder: "Enter your comments",
    rows: 3,
  },
};

export const WithDescription: Story = {
  args: {
    label: "Comments",
    description: "Please provide detailed feedback",
    placeholder: "Enter your comments",
    rows: 3,
  },
};

export const Required: Story = {
  args: {
    label: "Comments",
    required: true,
    placeholder: "Enter your comments",
    rows: 3,
  },
};

export const Disabled: Story = {
  args: {
    label: "Comments",
    disabled: true,
    defaultValue: "This textarea is disabled and cannot be edited.",
    placeholder: "Enter your comments",
    rows: 3,
  },
};

export const WithCharacterLimit: Story = {
  args: {
    label: "Comments",
    placeholder: "Enter your comments",
    maxLength: 100,
    rows: 3,
  },
};

export const AutoExpand: Story = {
  args: {
    label: "Comments",
    placeholder: "This textarea will expand as you type more content...",
    autoExpand: true,
    rows: 2,
  },
};

export const WithErrors: Story = {
  args: {
    label: "Comments",
    defaultValue: "Too short",
    errors: ["Comments must be at least 20 characters long"],
    placeholder: "Enter your comments",
    rows: 3,
  },
};

export const WithWarnings: Story = {
  args: {
    label: "Comments",
    defaultValue: "Brief comment",
    warnings: ["Consider providing more detailed feedback"],
    placeholder: "Enter your comments",
    rows: 3,
  },
};

export const SingleLine: Story = {
  args: {
    label: "Brief comment",
    placeholder: "Enter a single line of text",
    multiline: false,
    rows: 1,
  },
};
