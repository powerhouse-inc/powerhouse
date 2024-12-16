import type { Meta, StoryObj } from "@storybook/react";
import { Icon, type IconName } from "@/powerhouse/components/icon";
import { withForm } from "@/scalars/lib/decorators";
import { SelectField } from "./select-field";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
} from "@/scalars/lib/storybook-arg-types";

const meta: Meta<typeof SelectField> = {
  title: "Document Engineering/Fragments/SelectField",
  component: SelectField,
  parameters: {
    layout: "padded",
  },
  decorators: [
    withForm,
    (Story) => (
      <div style={{ maxWidth: "280px", margin: "1rem auto 0" }}>
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes(),
    ...PrebuiltArgTypes.placeholder,

    options: {
      control: "object",
      description: "Array of options to display in the select",
      table: {
        type: {
          summary:
            "Array<{ value: string; label: string; icon?: IconName | React.ComponentType<{ className?: string }>; disabled?: boolean }>",
        },
        defaultValue: { summary: "[]" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    searchable: {
      control: "boolean",
      description: "Whether to enable search functionality",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    searchPosition: {
      control: "radio",
      options: ["Dropdown", "Input"],
      description:
        "Position of the search input. Note: 'Input' is only available when multiple=false",
      table: {
        type: { summary: '"Dropdown" | "Input"' },
        defaultValue: { summary: '"Dropdown"' },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    multiple: {
      control: "boolean",
      description: "Whether multiple options can be selected",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    maxSelectedOptionsToShow: {
      control: "number",
      description: "Maximum number of selected items that will be shown",
      table: {
        type: { summary: "number" },
        defaultValue: { summary: "3" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    optionsCheckmark: {
      control: "radio",
      options: ["Auto", "None"],
      description: "Whether to show checkmarks in options",
      table: {
        type: { summary: '"Auto" | "None"' },
        defaultValue: { summary: '"Auto"' },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    ...getValidationArgTypes(),
  },
  args: {
    name: "select-field",
    errors: [],
    warnings: [],
  },
} satisfies Meta<typeof SelectField>;

export default meta;
type Story = StoryObj<typeof meta>;

const IconComponent = (
  name: IconName,
): React.ComponentType<{ className?: string }> => {
  return ({ className }) => (
    <Icon name={name} size={16} className={className} />
  );
};

const defaultOptions = [
  {
    value: "Briefcase",
    label: "Briefcase",
    icon: IconComponent("Briefcase"),
  },
  {
    value: "Drive",
    label: "Drive",
    icon: IconComponent("Drive"),
  },
  {
    value: "Globe",
    label: "Globe",
    icon: IconComponent("Globe"),
  },
  { value: "None", label: "None" },
];

// Basic examples
export const Default: Story = {
  args: {
    label: "Favorite icon",
    options: defaultOptions,
    placeholder: "Select an icon",
  },
};

export const WithDescription: Story = {
  args: {
    label: "Favorite icon",
    description: "Choose your favorite icon from the list",
    options: defaultOptions,
    placeholder: "Select an icon",
  },
};

export const Required: Story = {
  args: {
    label: "Required field",
    options: defaultOptions,
    placeholder: "Must select at least one option",
    required: true,
  },
};

export const WithDefaultValue: Story = {
  args: {
    label: "Preset selection",
    options: defaultOptions,
    placeholder: "Select an icon",
    defaultValue: "Drive",
  },
};

export const Disabled: Story = {
  args: {
    label: "Disabled field",
    options: defaultOptions,
    placeholder: "Select an icon",
    value: "Drive",
    disabled: true,
  },
};

// Validation states
export const WithError: Story = {
  args: {
    label: "With error",
    options: defaultOptions,
    placeholder: "Select icons",
    value: ["Drive"],
    multiple: true,
    errors: ["Please select at least two options"],
  },
};

export const WithWarning: Story = {
  args: {
    label: "With warning",
    options: defaultOptions,
    placeholder: "Select icons",
    value: ["Drive", "Globe"],
    multiple: true,
    warnings: ["Some selected options may not be available in the future"],
  },
};

// Special features
export const Searchable: Story = {
  args: {
    label: "Searchable field",
    description: "Type to search through options",
    options: defaultOptions,
    placeholder: "Select an icon",
    searchable: true,
  },
};

export const WithSearchInInput: Story = {
  args: {
    label: "Select country",
    description: "Type to search through options",
    options: [
      { value: "US", label: "United States" },
      { value: "GB", label: "United Kingdom" },
      { value: "FR", label: "France" },
      { value: "DE", label: "Germany" },
    ],
    placeholder: "Search...",
    optionsCheckmark: "None",
    searchable: true,
    searchPosition: "Input",
  },
};

export const WithDisabledOption: Story = {
  args: {
    label: "With disabled option",
    options: [
      ...defaultOptions,
      { value: "disabled", label: "Disabled option", disabled: true },
    ],
    placeholder: "Select an icon",
  },
};

export const Multiple: Story = {
  args: {
    label: "Multi select",
    description: "You can select multiple options",
    options: defaultOptions,
    placeholder: "Select icons",
    multiple: true,
  },
};

export const WithMaxItemsToShow: Story = {
  args: {
    label: "Limited display",
    description: "Only shows 2 selected items at a time",
    options: defaultOptions,
    placeholder: "Select icons",
    multiple: true,
    maxSelectedOptionsToShow: 2,
  },
};

export const WithoutCheckmarks: Story = {
  args: {
    label: "No checkmarks",
    description: "Options without checkmark indicators",
    options: defaultOptions,
    placeholder: "Select icons",
    optionsCheckmark: "None",
  },
};

export const WithPredefinedIcons: Story = {
  args: {
    label: "Options with predefined icon",
    description: "Choose your favorite predefined icon",
    options: [
      { value: "CircleInfo", label: "CircleInfo", icon: "CircleInfo" },
      { value: "Calendar", label: "Calendar", icon: "Calendar" },
      {
        value: "Settings",
        label: "Settings",
        icon: "Settings",
        disabled: true,
      },
      { value: "Trash", label: "Trash", icon: "Trash" },
      { value: "None", label: "None" },
    ],
    placeholder: "Select an icon",
  },
};

export const WithLongOptionLabel: Story = {
  args: {
    label: "With long option label",
    description: "The Select field handles long option labels",
    options: [
      {
        value: "very-long-option-1",
        label:
          "This is a very long option label that might need truncation in the UI",
        icon: IconComponent("CircleInfo"),
      },
      ...defaultOptions,
    ],
    placeholder: "Select an option",
  },
};
