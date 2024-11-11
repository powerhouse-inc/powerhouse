import type { Meta, StoryObj } from "@storybook/react";
import { SingleSelectField } from "./single-select-field";
import { CircleIcon, HomeIcon, StarIcon } from "lucide-react";

const meta: Meta<typeof SingleSelectField> = {
  title: "Document Engineering/Fragments/SingleSelectField",
  component: SingleSelectField,
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
      description: "Placeholder text when no option is selected",
      table: {
        type: { summary: "string" },
        defaultValue: { summary: "Select an option" },
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

    // State props
    defaultValue: {
      control: "text",
      description: "Default selected value",
      table: {
        type: { summary: "string" },
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
      control: "text",
      description: "Currently selected value",
      table: {
        type: { summary: "string" },
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
  },
  args: {
    name: "single-select",
    errors: [],
    warnings: [],
  },
} satisfies Meta<typeof SingleSelectField>;

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
    placeholder: "Select an option",
  },
};

export const WithLabel: Story = {
  args: {
    label: "Select an option",
    options: defaultOptions,
    placeholder: "Choose from the list",
  },
};

export const WithLabelAndDescription: Story = {
  args: {
    label: "Favorite Icon",
    description: "Choose your favorite icon from the list",
    options: defaultOptions,
    placeholder: "Select an icon",
  },
};

export const Required: Story = {
  args: {
    label: "Required Field",
    required: true,
    options: defaultOptions,
    placeholder: "Must select an option",
  },
};

export const WithDefaultValue: Story = {
  args: {
    label: "Preset Selection",
    defaultValue: "star",
    options: defaultOptions,
  },
};

export const Disabled: Story = {
  args: {
    label: "Disabled Field",
    disabled: true,
    options: defaultOptions,
    value: "home",
  },
};

export const WithError: Story = {
  args: {
    label: "Error State",
    options: defaultOptions,
    value: "home",
    errors: ["Please select a different option"],
  },
};

export const WithWarning: Story = {
  args: {
    label: "Warning State",
    options: defaultOptions,
    value: "circle",
    warnings: ["This option may not be available in the future"],
  },
};

export const Searchable: Story = {
  args: {
    label: "Searchable Select",
    description: "Type to search through options",
    options: defaultOptions,
    searchable: true,
  },
};

export const WithDisabledOption: Story = {
  args: {
    label: "With Disabled Option",
    options: [
      ...defaultOptions,
      { value: "disabled", label: "Disabled Option", disabled: true },
    ],
  },
};
