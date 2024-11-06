import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { TextareaField } from "./textarea-field";

const meta = {
  title: "Document Engineering/Fragments/TextareaField",
  component: TextareaField,
  parameters: {
    layout: "centered",
    controls: {
      sort: "requiredFirst",
      expanded: true,
    },
  },
  tags: ["autodocs"],
  argTypes: {
    autoComplete: {
      control: "boolean",
      description:
        "Whether to enable browser autocompletion for the textarea field",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Behavior",
      },
    },
    autoExpand: {
      control: "boolean",
      description:
        "Whether the textarea should automatically expand with content",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Behavior",
      },
    },
    autoFocus: {
      control: "boolean",
      description:
        "Whether the textarea should automatically receive focus on mount",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Behavior",
      },
    },
    className: {
      control: "text",
      description: "Additional CSS classes to apply to the textarea",
      table: {
        type: { summary: "string" },
        category: "Styling",
      },
    },
    customValidator: {
      description:
        "Custom validation function that returns error message or null",
      table: {
        type: { summary: "(value: string) => string | null" },
        category: "Validation",
      },
    },
    defaultValue: {
      control: "text",
      description: "Initial value for uncontrolled component usage",
      table: {
        type: { summary: "string" },
        category: "State",
      },
    },
    description: {
      control: "text",
      description: "Helper text displayed below the textarea field",
      table: {
        type: { summary: "string" },
        category: "Content",
      },
    },
    disabled: {
      control: "boolean",
      description: "Whether the textarea field is disabled",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "State",
      },
    },
    errors: {
      control: "object",
      description:
        "Array of error messages to display below the textarea field",
      table: {
        type: { summary: "string[]" },
        defaultValue: { summary: "[]" },
        category: "Validation",
      },
    },
    id: {
      control: "text",
      description:
        "Unique identifier for the textarea field. Auto-generated if not provided",
      table: {
        type: { summary: "string" },
        category: "Technical",
      },
    },
    label: {
      control: "text",
      description:
        "Label text displayed above the textarea field for accessibility and UX",
      table: {
        type: { summary: "string" },
        category: "Content",
      },
    },
    lowercase: {
      control: "boolean",
      description:
        "Transforms input text to lowercase. Cannot be used with uppercase",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Text Transformation",
      },
    },
    maxLength: {
      control: "number",
      description: "Maximum number of characters allowed in the textarea",
      table: {
        type: { summary: "number" },
        category: "Validation",
      },
    },
    minLength: {
      control: "number",
      description: "Minimum number of characters required in the textarea",
      table: {
        type: { summary: "number" },
        category: "Validation",
      },
    },
    name: {
      control: "text",
      description:
        "Name attribute for the textarea field. Auto-generated if not provided",
      table: {
        type: { summary: "string" },
        category: "Technical",
      },
    },
    onChange: {
      action: "onChange",
      description: "Callback fired when the textarea value changes",
      table: {
        type: {
          summary: "(event: React.ChangeEvent<HTMLTextAreaElement>) => void",
        },
        category: "Events",
      },
    },
    pattern: {
      control: "text",
      description: "Regular expression pattern for input validation",
      table: {
        type: { summary: "string" },
        category: "Validation",
      },
    },
    placeholder: {
      control: "text",
      description: "Placeholder text displayed when the textarea is empty",
      table: {
        type: { summary: "string" },
        category: "Content",
      },
    },
    required: {
      control: "boolean",
      description: "Whether the textarea input is required",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Validation",
      },
    },
    rows: {
      control: "number",
      description: "Number of visible text lines in the textarea",
      table: {
        type: { summary: "number" },
        defaultValue: { summary: "3" },
        category: "Appearance",
      },
    },
    showErrorOnBlur: {
      control: "boolean",
      description:
        "Whether to display validation errors when the field loses focus",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Validation",
      },
    },
    showErrorOnChange: {
      control: "boolean",
      description: "Whether to display validation errors as the user types",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Validation",
      },
    },
    spellCheck: {
      control: "boolean",
      description: "Whether to enable browser spell checking on the textarea",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Behavior",
      },
    },
    trim: {
      control: "boolean",
      description:
        "Whether to remove leading and trailing whitespace from the value",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Text Transformation",
      },
    },
    uppercase: {
      control: "boolean",
      description:
        "Transforms input text to uppercase. Cannot be used with lowercase",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Text Transformation",
      },
    },
    value: {
      control: "text",
      description:
        "Controlled value of the textarea field. Use with onChange handler",
      table: {
        type: { summary: "string" },
        category: "State",
      },
    },
    warnings: {
      control: "object",
      description: "Array of warning messages to display below the textarea",
      table: {
        type: { summary: "string[]" },
        defaultValue: { summary: "[]" },
        category: "Validation",
      },
    },
  },
} satisfies Meta<typeof TextareaField>;

export default meta;
type Story = StoryObj<typeof meta>;

// Basic Examples
export const WithLabel: Story = {
  args: {
    name: "textarea",
    label: "Message",
    placeholder: "Enter your message",
  },
};

export const WithLabelAndDescription: Story = {
  args: {
    name: "textarea",
    label: "Bio",
    description: "Tell us about yourself in a few sentences",
    placeholder: "I am...",
  },
};

// Validation States
export const Required: Story = {
  args: {
    name: "textarea",
    label: "Comments",
    required: true,
    placeholder: "This field is required",
  },
};

export const WithSingleWarning: Story = {
  args: {
    name: "textarea",
    label: "Feedback",
    value: "OK",
    warnings: ["Your feedback seems quite short"],
  },
};

export const WithMultipleWarnings: Story = {
  args: {
    name: "textarea",
    label: "Feedback",
    value: "warnings",
    warnings: [
      "Consider providing more detailed feedback",
      "Your response may be too brief for proper evaluation",
    ],
  },
};

export const WithSingleError: Story = {
  args: {
    name: "textarea",
    label: "Comments",
    value: "error",
    errors: ["Comments must be at least 10 characters long"],
    minLength: 10,
  },
};

export const WithMultipleErrors: Story = {
  args: {
    name: "textarea",
    label: "Comments",
    value: "errors",
    errors: [
      "Comments must be at least 10 characters long",
      "Comments must include a specific example",
    ],
    minLength: 10,
  },
};

export const WithWarningsAndErrors: Story = {
  args: {
    name: "textarea",
    label: "Feedback",
    value: "warnings and errors",
    warnings: [
      "Consider providing more detailed feedback",
      "Your response may be too brief",
    ],
    errors: [
      "Feedback must be at least 10 characters long",
      "Feedback must include specific examples",
    ],
  },
};

// Length Constraints
export const WithMinLength: Story = {
  args: {
    name: "textarea",
    label: "Short answer",
    minLength: 20,
    placeholder: "Must be at least 20 characters",
    description: "Minimum length: 20 characters",
  },
};

export const WithMaxLength: Story = {
  args: {
    name: "textarea",
    label: "Brief response",
    maxLength: 50,
    placeholder: "Maximum 50 characters allowed",
    description: "Maximum length: 50 characters",
    value: "", // Initial value
  },
  render: (args) => {
    const [value, setValue] = useState(args.value || "");
    return (
      <TextareaField
        {...args}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  },
};

export const WithMinAndMaxLength: Story = {
  args: {
    name: "textarea",
    label: "Constrained response",
    minLength: 20,
    maxLength: 100,
    placeholder: "Between 20 and 100 characters",
    description: "Please provide between 20 and 100 characters",
    value: "", // Initial value
  },
  render: (args) => {
    const [value, setValue] = useState(args.value || "");
    return (
      <TextareaField
        {...args}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  },
};

// Visual States
export const Disabled: Story = {
  args: {
    name: "textarea",
    label: "Disabled content",
    value: "This content cannot be edited",
    disabled: true,
  },
};

export const Focused: Story = {
  args: {
    name: "textarea",
    label: "Focused textarea",
    placeholder: "This field is focused",
    autoFocus: true,
  },
  parameters: {
    pseudo: { focus: true },
  },
};

// Special Features
export const WithAutoComplete: Story = {
  args: {
    name: "textarea",
    label: "Auto-complete enabled textarea",
    autoComplete: true,
    placeholder: "Browser auto-complete is enabled...",
    description: "This field will show browser auto-complete suggestions",
  },
};

export const WithSpellCheck: Story = {
  args: {
    name: "textarea",
    label: "Spell-checked textarea",
    spellCheck: true,
    placeholder: "Spell checking is enabled...",
    description: "This field will check your spelling",
  },
};

export const WithCustomRows: Story = {
  args: {
    name: "textarea",
    label: "Custom height textarea",
    rows: 10,
    placeholder: "This textarea shows 10 rows...",
  },
};

export const AutoExpanding: Story = {
  args: {
    name: "textarea",
    label: "Auto-expanding textarea",
    autoExpand: true,
    placeholder: "This will grow as you type...",
    description:
      "The textarea will automatically expand as you type more content",
  },
};

// Text Transformations
export const WithTrimTransformation: Story = {
  args: {
    name: "textarea",
    label: "Trimmed text",
    value: "  This text will have whitespace trimmed  ",
    trim: true,
    description: "Leading and trailing whitespace will be removed",
  },
  render: (args) => {
    const [value, setValue] = useState(args.value || "");
    return (
      <TextareaField
        {...args}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  },
};

export const WithUppercaseTransformation: Story = {
  args: {
    name: "textarea",
    label: "Uppercase text",
    value: "This text will be uppercase",
    uppercase: true,
    description: "Text will be converted to uppercase",
  },
  render: (args) => {
    const [value, setValue] = useState(args.value || "");
    return (
      <TextareaField
        {...args}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  },
};

export const WithLowercaseTransformation: Story = {
  args: {
    name: "textarea",
    label: "Lowercase text",
    value: "THIS TEXT WILL BE LOWERCASE",
    lowercase: true,
    description: "Text will be converted to lowercase",
  },
  render: (args) => {
    const [value, setValue] = useState(args.value || "");
    return (
      <TextareaField
        {...args}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  },
};

export const WithTrimAndUppercaseTransformations: Story = {
  args: {
    name: "textarea",
    label: "Transformed text",
    value: "  this will be trimmed and uppercase  ",
    trim: true,
    uppercase: true,
    description: "Text will be trimmed and converted to uppercase",
  },
  render: (args) => {
    const [value, setValue] = useState(args.value || "");
    return (
      <TextareaField
        {...args}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  },
};
