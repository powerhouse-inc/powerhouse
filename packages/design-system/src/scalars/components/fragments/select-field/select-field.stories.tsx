import type { Meta, StoryObj } from "@storybook/react";
import { SelectField } from "./select-field";
import { CircleIcon, HomeIcon, StarIcon } from "lucide-react";

const meta: Meta<typeof SelectField> = {
  title: "Document Engineering/Fragments/SelectField",
  component: SelectField,
  parameters: {
    layout: "padded",
    controls: {
      sort: "requiredFirst",
      expanded: true,
    },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "280px", margin: "1rem auto 0" }}>
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
  argTypes: {
    // Core props
    id: {
      control: "text",
      description: "Custom ID for the select field",
      table: {
        type: { summary: "string" },
        category: "Core",
      },
    },
    name: {
      control: "text",
      description: "Name attribute for the select field",
      table: {
        type: { summary: "string" },
        category: "Core",
      },
    },
    options: {
      control: "object",
      description: "Array of options to display in the select",
      table: {
        type: {
          summary:
            "Array<{ value: string; label: string; icon?: IconComponent; disabled?: boolean }>",
        },
        category: "Core",
      },
    },

    // Content props
    label: {
      control: "text",
      description: "Label text displayed above the select field",
      table: {
        type: { summary: "string" },
        category: "Content",
      },
    },
    description: {
      control: "text",
      description: "Helper text displayed below the select field",
      table: {
        type: { summary: "string" },
        category: "Content",
      },
    },
    placeholder: {
      control: "text",
      description: "Placeholder text when no options are selected",
      table: {
        type: { summary: "string" },
        defaultValue: { summary: "Select options" },
        category: "Content",
      },
    },

    // Behavior props
    asChild: {
      control: "boolean",
      description: "Whether to render the trigger as a child component",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Behavior",
      },
    },
    asModal: {
      control: "boolean",
      description: "Whether to render the popover as a modal",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Behavior",
      },
    },
    autoFocus: {
      control: "boolean",
      description: "Whether the field should be focused on mount",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Behavior",
      },
    },
    searchable: {
      control: "boolean",
      description: "Whether to enable search functionality",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Behavior",
      },
    },
    maxSelectedOptionsToShow: {
      control: "number",
      description: "Maximum number of items that will be shown",
      table: {
        type: { summary: "number" },
        category: "Behavior",
      },
    },

    // State props
    defaultValue: {
      control: "object",
      description: "Default selected values",
      table: {
        type: { summary: "string[]" },
        category: "State",
      },
    },
    disabled: {
      control: "boolean",
      description: "Whether the select field is disabled",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "State",
      },
    },
    value: {
      control: "object",
      description: "Currently selected values",
      table: {
        type: { summary: "string[]" },
        category: "State",
      },
    },

    // Validation props
    errors: {
      control: "object",
      description: "Array of error messages to display",
      table: {
        type: { summary: "string[]" },
        defaultValue: { summary: "[]" },
        category: "Validation",
      },
    },
    required: {
      control: "boolean",
      description: "Whether the field is required",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Validation",
      },
    },
    warnings: {
      control: "object",
      description: "Array of warning messages to display",
      table: {
        type: { summary: "string[]" },
        defaultValue: { summary: "[]" },
        category: "Validation",
      },
    },
    showErrorOnBlur: {
      control: "boolean",
      description: "Whether to show validation errors on blur",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Validation",
      },
    },
    showErrorOnChange: {
      control: "boolean",
      description: "Whether to show validation errors on change",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Validation",
      },
    },

    // Events
    onChange: {
      action: "changed",
      description: "Callback fired when selection changes",
      table: {
        type: { summary: "function" },
        category: "Events",
      },
    },

    // Styling
    className: {
      control: "text",
      description: "Additional CSS classes to apply to the select",
      table: {
        type: { summary: "string" },
        category: "Styling",
      },
    },
    multiple: {
      control: "boolean",
      description: "Whether multiple options can be selected",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Behavior",
      },
    },
  },
  args: {
    name: "select-field",
    errors: [],
    warnings: [],
  },
} satisfies Meta<typeof SelectField>;

export default meta;

type Story = StoryObj<typeof meta>;

const defaultOptions = [
  { value: "home", label: "Home", icon: HomeIcon },
  { value: "star", label: "Star", icon: StarIcon },
  { value: "circle", label: "Circle", icon: CircleIcon },
];

export const Default: Story = {
  args: {
    options: defaultOptions,
  },
};

export const WithLabel: Story = {
  args: {
    label: "Choose from the list",
    options: defaultOptions,
  },
};

export const WithLabelAndDescription: Story = {
  args: {
    label: "Favorite icon",
    description: "Choose your favorite icon from the list",
    options: defaultOptions,
    placeholder: "Select an icon",
  },
};

export const Required: Story = {
  args: {
    label: "Required",
    options: defaultOptions,
    placeholder: "Must select at least one option",
    required: true,
  },
};

export const WithDefaultValue: Story = {
  args: {
    label: "Preset selection",
    options: defaultOptions,
    defaultValue: ["star"],
  },
};

export const WithMaxItemsToShow: Story = {
  args: {
    label: "Limited display",
    description: "Only shows 2 selected items at a time",
    options: defaultOptions,
    multiple: true,
    maxSelectedOptionsToShow: 2,
  },
};

export const Disabled: Story = {
  args: {
    label: "Disabled",
    disabled: true,
    options: defaultOptions,
    value: ["home"],
  },
};

export const WithError: Story = {
  args: {
    label: "Error",
    options: defaultOptions,
    value: ["home"],
    multiple: true,
    errors: ["Please select at least two options"],
  },
};

export const WithWarning: Story = {
  args: {
    label: "Warning",
    options: defaultOptions,
    value: ["circle", "star"],
    multiple: true,
    warnings: ["Some selected options may not be available in the future"],
  },
};

export const Searchable: Story = {
  args: {
    label: "Searchable",
    description: "Type to search through options",
    options: defaultOptions,
    searchable: true,
  },
};

export const WithDisabledOption: Story = {
  args: {
    label: "With a disabled option",
    options: [
      ...defaultOptions,
      { value: "disabled", label: "Disabled option", disabled: true },
    ],
  },
};

export const Multiple: Story = {
  args: {
    label: "Multi select",
    options: defaultOptions,
    multiple: true,
  },
};
