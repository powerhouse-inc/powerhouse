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
      options: ["RadioGroup", "Select"],
      description: "Display variant of the enum field",
      table: {
        type: { summary: '"RadioGroup" | "Select"' },
        defaultValue: { summary: "RadioGroup" },
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

    optionLabels: {
      control: "object",
      description: "Object mapping of values to labels",
      table: {
        type: { summary: "Record<string, string>" },
        defaultValue: { summary: "{}" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    disabledOptions: {
      control: "object",
      description: "Array of disabled option values",
      table: {
        type: { summary: "string[]" },
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
  disabledOptions?: string[];
  errors?: string[];
  label?: string;
  multiple?: boolean;
  name?: string;
  optionLabels?: Record<string, string>;
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
  variant: "RadioGroup" | "Select";
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
    variant: "RadioGroup",
    options: defaultOptions,
  },
};

export const WithDescription: Story = {
  args: {
    label: "Select an option",
    description: "Choose your preferred option from the list",
    variant: "RadioGroup",
    options: defaultOptions.map((opt) => ({
      ...opt,
      description: `Description for ${opt.label} option`,
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

// Using optionLabels
export const UsingOptionLabels: Story = {
  args: {
    label: "Using optionLabels",
    variant: "RadioGroup",
    optionLabels: {
      option1: "First Option",
      option2: "Second Option",
      option3: "Third Option",
    },
  },
};

export const UsingDisabledOptions: Story = {
  args: {
    label: "Using disabledOptions",
    variant: "RadioGroup",
    optionLabels: {
      option1: "Available Option",
      option2: "Disabled Option",
      option3: "Another Available Option",
    },
    disabledOptions: ["option2"],
  },
};
