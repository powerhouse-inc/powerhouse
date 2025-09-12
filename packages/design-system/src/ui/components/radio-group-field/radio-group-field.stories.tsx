import {
  getDefaultArgTypes,
  getValidationArgTypes,
  RadioGroupField,
  StorybookControlCategory,
  withForm,
} from "@powerhousedao/design-system";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/RadioGroupField",
  component: RadioGroupField,
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
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    ...getValidationArgTypes(),
  },
  args: {
    name: "radio-group",
    errors: [],
    warnings: [],
  },
} satisfies Meta<typeof RadioGroupField>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultOptions = [
  { label: "Option 1", value: "1" },
  { label: "Option 2", value: "2" },
  { label: "Option 3", value: "3" },
];

// Basic examples
export const Default: Story = {
  args: {
    label: "Radio Group",
    options: defaultOptions,
  },
};

export const WithDescription: Story = {
  args: {
    label: "Radio Group",
    description: "This is a helpful description for the Radio Group",
    options: defaultOptions,
  },
};

export const Required: Story = {
  args: {
    label: "Required Radio Group",
    options: defaultOptions,
    required: true,
  },
};

export const WithDefaultValue: Story = {
  args: {
    label: "Radio Group with an option selected by default",
    defaultValue: "2",
    options: defaultOptions,
  },
};

export const Disabled: Story = {
  args: {
    label: "Disabled Radio Group",
    disabled: true,
    options: defaultOptions,
    value: defaultOptions[0].value,
  },
};

// Validation states
export const WithError: Story = {
  args: {
    label: "Radio Group with errors",
    errors: ["Please select an option"],
    options: defaultOptions,
  },
};

export const WithWarning: Story = {
  args: {
    label: "Radio Group with warnings",
    warnings: ["Your selection may need review"],
    options: defaultOptions,
    defaultValue: "3",
  },
};

// Special features
export const WithDescriptionInOptions: Story = {
  args: {
    label: "Radio Group with description in options",
    options: [
      {
        label: "Option 1",
        value: "1",
        description: "Description for option 1",
      },
      {
        label: "Option 2",
        value: "2",
        description: "Description for option 2",
      },
    ],
  },
};

export const WithDisabledOptions: Story = {
  args: {
    label: "Radio Group with disabled options",
    options: [
      { label: "Option 1", value: "1" },
      { label: "Option 2", value: "2", disabled: true },
      { label: "Option 3", value: "3" },
      {
        label: "Option 4",
        value: "4",
        disabled: true,
        description: "This option is disabled",
      },
    ],
  },
};
