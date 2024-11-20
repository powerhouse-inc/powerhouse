import type { Meta, StoryObj } from "@storybook/react";
import { CircleIcon, HomeIcon, StarIcon } from "lucide-react";
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
    controls: {
      sort: "requiredFirst",
      expanded: true,
    },
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
            "Array<{ value: string; label: string; icon?: IconComponent; disabled?: boolean }>",
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
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    multiple: {
      control: "boolean",
      description: "Whether multiple options can be selected",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    maxSelectedOptionsToShow: {
      control: "number",
      description: "Maximum number of items that will be shown",
      table: {
        type: { summary: "number" },
        defaultValue: { summary: "3" },
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

const defaultOptions = [
  { value: "home", label: "Home", icon: HomeIcon },
  { value: "star", label: "Star", icon: StarIcon },
  { value: "circle", label: "Circle", icon: CircleIcon },
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
    defaultValue: ["star"],
  },
};

export const Disabled: Story = {
  args: {
    label: "Disabled field",
    disabled: true,
    options: defaultOptions,
    value: ["home"],
  },
};

// Validation states
export const WithError: Story = {
  args: {
    label: "With error",
    options: defaultOptions,
    value: ["home"],
    multiple: true,
    errors: ["Please select at least two options"],
  },
};

export const WithWarning: Story = {
  args: {
    label: "With warning",
    options: defaultOptions,
    value: ["circle", "star"],
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
