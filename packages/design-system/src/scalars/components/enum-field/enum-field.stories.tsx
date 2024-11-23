import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { CircleIcon, HomeIcon, StarIcon } from "lucide-react";
import { withForm } from "@/scalars/lib/decorators";
import { EnumField } from "./enum-field";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  StorybookControlCategory,
} from "@/scalars/lib/storybook-arg-types";

const meta: Meta<typeof EnumField> = {
  title: "Document Engineering/Simple Components/Enum Field",
  component: EnumField,
  decorators: [
    withForm,
    (Story) => (
      <div style={{ maxWidth: "280px", margin: "1rem auto 0" }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "padded",
    controls: {
      sort: "requiredFirst",
      expanded: true,
    },
  },
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes(),

    variant: {
      control: "radio",
      options: ["Auto", "RadioGroup", "Select"],
      description: "Enum field variant",
      table: {
        type: { summary: '"Auto" | "RadioGroup" | "Select"' },
        defaultValue: { summary: "Auto" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    options: {
      control: "object",
      description: "Array of options with label, value, icon, and description",
      table: {
        type: {
          summary:
            "Array<{ label: string; value: string; icon?: IconComponent; description?: string; disabled?: boolean; }>",
        },
        defaultValue: { summary: "[]" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    ...getValidationArgTypes(),
  },
  args: {
    name: "enum-field",
    errors: [],
    warnings: [],
  },
} satisfies Meta<typeof EnumField>;

export default meta;

type EnumFieldArgs = {
  defaultValue?: string | string[];
  description?: string;
  disabled?: boolean;
  errors?: string[];
  label?: string;
  multiple?: boolean;
  name?: string;
  options?: {
    value: string;
    label: string;
    icon?: React.ComponentType;
    description?: string;
    disabled?: boolean;
  }[];
  placeholder?: string;
  required?: boolean;
  searchable?: boolean;
  value?: string;
  variant: "Auto" | "RadioGroup" | "Select";
  warnings?: string[];
};

type Story = StoryObj<EnumFieldArgs>;

const defaultOptions = [
  { value: "home", label: "Home", icon: HomeIcon },
  { value: "star", label: "Star", icon: StarIcon },
  { value: "circle", label: "Circle", icon: CircleIcon },
];

export const Default: Story = {
  args: {
    label: "Select an option",
    options: defaultOptions,
  },
};

export const WithDescription: Story = {
  args: {
    label: "Select an option",
    description: "Choose your preferred option from the list",
    variant: "RadioGroup",
    options: defaultOptions.map((opt, index) => ({
      ...opt,
      description:
        index === 2 ? `Description for ${opt.label} option` : undefined,
    })),
  },
};

export const Required: Story = {
  args: {
    label: "Required field",
    required: true,
    variant: "RadioGroup",
    options: defaultOptions,
  },
};

export const WithDefaultValue: Story = {
  args: {
    label: "Preset selection",
    variant: "RadioGroup",
    options: defaultOptions,
    defaultValue: "star",
  },
};

export const Disabled: Story = {
  args: {
    label: "Disabled field",
    disabled: true,
    variant: "RadioGroup",
    options: defaultOptions,
    value: "home",
  },
};

// Validation states
export const WithError: Story = {
  args: {
    label: "With error",
    variant: "RadioGroup",
    options: defaultOptions,
    value: "home",
    errors: ["Please select a different option"],
  },
};

export const WithWarning: Story = {
  args: {
    label: "With warning",
    variant: "RadioGroup",
    options: defaultOptions,
    value: "star",
    warnings: ["This option may be deprecated soon"],
  },
};

// Variant examples
export const Select: Story = {
  args: {
    label: "Select variant",
    variant: "Select",
    options: defaultOptions,
    placeholder: "Select an option",
  },
};

export const SelectWithDescription: Story = {
  args: {
    label: "Select variant with descriptions",
    description: "Choose your preferred option",
    variant: "Select",
    options: defaultOptions,
    placeholder: "Select an option",
  },
};

export const MultiSelect: Story = {
  args: {
    label: "Multi-select variant",
    variant: "Select",
    options: defaultOptions,
    placeholder: "Select options",
    defaultValue: ["home", "star"],
    multiple: true,
  },
};

export const SearchableSelect: Story = {
  args: {
    label: "Searchable select variant",
    variant: "Select",
    options: defaultOptions,
    placeholder: "Search and select an option",
    searchable: true,
  },
};
