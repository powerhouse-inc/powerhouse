import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
  withForm,
} from "#scalars";
import type { Meta, StoryObj } from "@storybook/react";
import { TextareaField } from "./textarea-field.js";

const meta = {
  title: "Document Engineering/Fragments/TextareaField",
  component: TextareaField,
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

    autoExpand: {
      control: "boolean",
      description:
        "Whether the textarea should automatically expand with content",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    multiline: {
      control: "boolean",
      description: "Whether the textarea should accept multiple lines of text",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "true" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    rows: {
      control: "number",
      description: "Number of visible text lines in the textarea",
      table: {
        type: { summary: "number" },
        defaultValue: { summary: "3" },
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
    name: "textarea",
    errors: [],
    warnings: [],
  },
} satisfies Meta<typeof TextareaField>;

export default meta;
type Story = StoryObj<typeof meta>;

// Basic examples
export const Default: Story = {
  args: {
    label: "Message",
    placeholder: "Enter your message",
    multiline: true,
  },
};

export const WithDescription: Story = {
  args: {
    label: "Bio",
    description: "Tell us a little bit about yourself",
    placeholder: "I am...",
    multiline: true,
  },
};

export const Required: Story = {
  args: {
    label: "Comments",
    required: true,
    placeholder: "This field is required",
    multiline: true,
  },
};

export const WithValue: Story = {
  args: {
    label: "Comments",
    value: "This is a pre-filled value",
    placeholder: "Enter your comments",
    multiline: true,
  },
};

export const Disabled: Story = {
  args: {
    label: "Disabled content",
    value: "This content cannot be edited",
    disabled: true,
    placeholder: "This field is disabled",
    multiline: true,
  },
};

// Validation states
export const WithError: Story = {
  args: {
    label: "Comments",
    value: "error",
    errors: ["Comments must be at least 10 characters long"],
    minLength: 10,
    placeholder: "Enter your comments",
    multiline: true,
  },
};

export const WithWarning: Story = {
  args: {
    label: "Feedback",
    value: "OK",
    warnings: ["Your feedback seems quite short"],
    placeholder: "Enter your feedback",
    multiline: true,
  },
};

// Special features
export const WithAutoExpand: Story = {
  args: {
    label: "Auto-expanding textarea",
    autoExpand: true,
    placeholder: "This will grow as you type...",
    description:
      "The textarea will automatically expand as you type more content",
    multiline: true,
  },
};

export const WithAutoExpandSingleLine: Story = {
  args: {
    label: "Single-line auto-expanding textarea",
    autoExpand: true,
    multiline: false,
    placeholder: "This will grow as you type...",
    description:
      "This textarea does not accept line breaks or the Enter key, but will expand.",
  },
};

export const WithResizableContainer: Story = {
  args: {
    label: "Auto-expanding textarea inside a resizable container",
    autoExpand: true,
    placeholder: "Type something...",
    multiline: true,
  },
  decorators: [
    (Story) => (
      <div
        style={{
          resize: "horizontal",
          overflow: "auto",
          padding: "16px",
          border: "1px dotted black",
          minWidth: "200px",
          minHeight: "150px",
        }}
      >
        <Story />
      </div>
    ),
  ],
};

export const WithSpellCheck: Story = {
  args: {
    label: "Spell-checked textarea",
    spellCheck: true,
    placeholder: "Spell checking is enabled...",
    description: "This field will check your spelling",
    multiline: true,
  },
};

// Text transformations
export const WithTrim: Story = {
  args: {
    label: "Trimmed text",
    value: "  This text will have whitespace trimmed  ",
    trim: true,
    description: "Leading and trailing whitespace will be removed",
    placeholder: "Enter your comments",
    multiline: true,
  },
};

export const WithUppercase: Story = {
  args: {
    label: "Uppercase text",
    value: "This text will be uppercase",
    uppercase: true,
    description: "Text will be converted to uppercase",
    placeholder: "Enter your comments",
    multiline: true,
  },
};

export const WithLowercase: Story = {
  args: {
    label: "Lowercase text",
    value: "THIS TEXT WILL BE LOWERCASE",
    lowercase: true,
    description: "Text will be converted to lowercase",
    placeholder: "Enter your comments",
    multiline: true,
  },
};

export const WithMaxLength: Story = {
  args: {
    label: "Character limited textarea",
    maxLength: 100,
    value: "This textarea has a maximum length of 100 characters.",
    description: "You can enter up to 100 characters in this field",
    placeholder: "Enter your comments",
    multiline: true,
  },
};
