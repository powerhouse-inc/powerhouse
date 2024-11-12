import type { Meta, StoryObj } from "@storybook/react";
import { withForm } from "@/scalars/lib/decorators";
import { RadioGroupField } from "./radio-group-field";

const meta: Meta<typeof RadioGroupField> = {
  argTypes: {
    autoFocus: {
      control: "boolean",
      description: "Whether the Radio Group should be focused on mount",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Behavior",
      },
    },
    className: {
      control: "text",
      description: "Additional CSS classes to apply to the Radio Group",
      table: {
        type: { summary: "string" },
        category: "Styling",
      },
    },
    defaultValue: {
      control: "text",
      description: "Default selected value for uncontrolled Radio Group",
      table: {
        type: { summary: "string" },
        category: "State",
      },
    },
    description: {
      control: "text",
      description: "Description for the Radio Group",
      table: {
        type: { summary: "string" },
        category: "Content",
      },
    },
    disabled: {
      control: "boolean",
      description: "Whether the radio group is disabled",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "State",
      },
    },
    errors: {
      control: "object",
      description: "Array of error messages to display below the Radio Group",
      table: {
        type: { summary: "string[]" },
        defaultValue: { summary: "[]" },
        category: "Validation",
      },
    },
    id: {
      control: "text",
      description: "Unique identifier for the Radio Group",
      table: {
        type: { summary: "string" },
        category: "Technical",
      },
    },
    label: {
      control: "text",
      description: "Label for the Radio Group",
      table: {
        type: { summary: "string" },
        category: "Content",
      },
    },
    name: {
      control: "text",
      description: "Name attribute for the Radio Group form field",
      table: {
        type: { summary: "string" },
        category: "Technical",
      },
    },
    onChange: {
      action: "onChange",
      description: "Callback fired when a radio option is selected",
      table: {
        type: { summary: "(value: string) => void" },
        category: "Events",
      },
    },
    options: {
      control: "object",
      description:
        "Array of options with label, value, description, and disabled state",
      table: {
        type: {
          summary:
            "Array<{ label: string; value: string; description?: string; disabled?: boolean; }>",
        },
        defaultValue: { summary: "[]" },
        category: "Content",
      },
    },
    required: {
      control: "boolean",
      description: "Whether selecting an option is required",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Validation",
      },
    },
    value: {
      control: "text",
      description: "Currently selected value (for controlled component)",
      table: {
        type: { summary: "string" },
        category: "State",
      },
    },
    warnings: {
      control: "object",
      description: "Array of warning messages to display below the Radio Group",
      table: {
        type: { summary: "string[]" },
        defaultValue: { summary: "[]" },
        category: "Validation",
      },
    },
  },
  component: RadioGroupField,
  decorators: [withForm],
  parameters: {
    layout: "centered",
    controls: {
      sort: "requiredFirst",
      expanded: true,
    },
  },
  tags: ["autodocs"],
  title: "Document Engineering/Fragments/Radio Group Field",
};

export default meta;

type Story = StoryObj<typeof RadioGroupField>;

const defaultOptions = [
  { label: "Option 1", value: "1" },
  { label: "Option 2", value: "2" },
  { label: "Option 3", value: "3" },
];

export const WithoutLabel: Story = {
  args: {
    name: "radio-group",
    options: defaultOptions,
  },
};

export const WithLabel: Story = {
  args: {
    name: "radio-group",
    label: "Radio Group with label",
    options: defaultOptions,
  },
};

export const WithLabelAndDescription: Story = {
  args: {
    name: "radio-group",
    description: "This is a helpful description for the Radio Group",
    label: "Radio Group with label and description",
    options: defaultOptions,
  },
};

export const WithWarnings: Story = {
  args: {
    name: "radio-group",
    warnings: ["Warning 1", "Warning 2"],
    label: "Radio Group with warnings",
    options: defaultOptions,
  },
};

export const WithErrors: Story = {
  args: {
    name: "radio-group",
    errors: ["Error 1", "Error 2"],
    label: "Radio Group with errors",
    options: defaultOptions,
  },
};

export const WithWarningsAndErrors: Story = {
  args: {
    name: "radio-group",
    warnings: ["Warning 1", "Warning 2"],
    errors: ["Error 1", "Error 2"],
    label: "Radio Group with warnings and errors",
    options: defaultOptions,
  },
};

export const Required: Story = {
  args: {
    name: "radio-group",
    label: "Required Radio Group",
    options: defaultOptions,
    required: true,
  },
};

export const WithOptionSelectedByDefault: Story = {
  args: {
    name: "radio-group",
    defaultValue: "2",
    label: "Radio Group with option selected by default",
    options: defaultOptions,
  },
};

export const WithDescriptionInOptions: Story = {
  args: {
    name: "radio-group",
    label: "Radio Group with description in the options",
    options: [
      {
        description: "Description for option 1",
        label: "Option 1",
        value: "1",
      },
      {
        description: "Description for option 2",
        label: "Option 2",
        value: "2",
      },
    ],
  },
};

export const WithDisabledOptions: Story = {
  args: {
    name: "radio-group",
    label: "Radio Group with disabled options",
    options: [
      { label: "Option 1", value: "1" },
      { label: "Option 2 (Disabled)", value: "2", disabled: true },
      { label: "Option 3", value: "3" },
      {
        label: "Option 4 (Disabled with description)",
        value: "4",
        disabled: true,
        description: "This option is disabled and has a description",
      },
    ],
  },
};

export const Disabled: Story = {
  args: {
    name: "radio-group",
    label: "Disabled Radio Group",
    disabled: true,
    options: defaultOptions,
    value: defaultOptions[0].value,
  },
};
