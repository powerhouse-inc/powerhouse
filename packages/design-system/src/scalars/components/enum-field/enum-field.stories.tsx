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

    multiple: {
      control: "boolean",
      description: "Whether multiple options can be selected",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    optionsCheckmark: {
      control: "radio",
      options: ["Auto", "Checkmark"],
      description:
        "Type of checkmark to show in the options. " +
        "Auto: Show a Radio for Single Select and a Checkbox for Multi Select. " +
        "Checkmark: Show a Checkmark for Single and Multi Select. ",
      table: {
        type: { summary: '"Auto" | "Checkmark"' },
        defaultValue: { summary: '"Auto"' },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    optionsCheckmarkPosition: {
      control: "radio",
      options: ["Left", "Right"],
      description:
        'Checkmark position in options. Only apply if optionsCheckmark is "Checkmark".',
      table: {
        type: { summary: '"Left" | "Right"' },
        defaultValue: { summary: '"Left"' },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
      if: { arg: "optionsCheckmark", eq: "Checkmark" },
    },

    searchable: {
      control: "boolean",
      description: "Whether to enable search functionality",
      table: {
        type: { summary: "boolean" },
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
  optionsCheckmark?: "Auto" | "Checkmark";
  optionsCheckmarkPosition?: "Left" | "Right";
  placeholder?: string;
  required?: boolean;
  searchable?: boolean;
  value?: string | string[];
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
  { value: "Briefcase", label: "Briefcase" },
  { value: "Drive", label: "Drive" },
  { value: "Globe", label: "Globe" },
  { value: "Settings", label: "Settings" },
];

const defaultOptionsWithIcon = [
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
  {
    value: "Settings",
    label: "Settings",
    icon: IconComponent("Settings"),
  },
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
    label: "Multi Select variant",
    variant: "Select",
    options: defaultOptions,
    placeholder: "Select options",
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

export const SelectWithCheckmark: Story = {
  args: {
    label: "With checkmark",
    description: "Shows a checkmark for selected options",
    variant: "Select",
    options: defaultOptions,
    optionsCheckmark: "Checkmark",
    placeholder: "Select an icon name",
  },
};

export const SelectWithIcon: Story = {
  args: {
    label: "Favorite icon",
    description: "Choose your favorite icon",
    variant: "Select",
    options: defaultOptionsWithIcon,
    optionsCheckmark: "Checkmark",
    optionsCheckmarkPosition: "Right",
    placeholder: "Select an icon",
  },
};
