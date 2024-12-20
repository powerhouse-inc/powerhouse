import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Icon, type IconName } from "@/powerhouse/components/icon";
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
  },
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes(),

    variant: {
      control: "radio",
      options: ["Auto", "RadioGroup", "Select"],
      description:
        "Enum field variant. " +
        "Auto: uses the most appropriate variant based on the number of options " +
        "(less than 6 options -> RadioGroup, 6 options or more -> Select). " +
        "RadioGroup: displays options in a group of radio buttons. " +
        "Select: displays options in a dropdown menu.",
      table: {
        type: { summary: '"Auto" | "RadioGroup" | "Select"' },
        defaultValue: { summary: "Auto" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    options: {
      control: "object",
      description:
        "Array of options with label, value, icon, description and disabled",
      table: {
        type: {
          summary:
            "Array<{ label: string; value: string; icon?: IconName | React.ComponentType<{ className?: string }>; description?: string; disabled?: boolean; }>",
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

export const Default: Story = {
  args: {
    label: "Select an option",
    options: defaultOptions,
    placeholder: "Choose from the list",
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
    placeholder: "Choose from the list",
  },
};

export const Required: Story = {
  args: {
    label: "Required field",
    variant: "RadioGroup",
    options: defaultOptions,
    placeholder: "Choose from the list",
    required: true,
  },
};

export const WithDefaultValue: Story = {
  args: {
    label: "Preset selection",
    variant: "RadioGroup",
    options: defaultOptions,
    placeholder: "Choose from the list",
    defaultValue: "Drive",
  },
};

export const Disabled: Story = {
  args: {
    label: "Disabled field",
    variant: "RadioGroup",
    options: defaultOptions,
    placeholder: "Choose from the list",
    value: "Drive",
    disabled: true,
  },
};

// Validation states
export const WithError: Story = {
  args: {
    label: "With error",
    variant: "RadioGroup",
    options: defaultOptions,
    placeholder: "Choose from the list",
    value: "Drive",
    errors: ["Please select a different option"],
  },
};

export const WithWarning: Story = {
  args: {
    label: "With warning",
    variant: "RadioGroup",
    options: defaultOptions,
    placeholder: "Choose from the list",
    value: "Drive",
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
    defaultValue: ["Drive", "Globe"],
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
