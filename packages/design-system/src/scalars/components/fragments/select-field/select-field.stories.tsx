import { Icon, type IconName } from "#powerhouse";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
  withForm,
} from "#scalars";
import type { Meta, StoryObj } from "@storybook/react";
import { SelectField } from "./select-field.js";

const meta: Meta<typeof SelectField> = {
  title: "Document Engineering/Fragments/SelectField",
  component: SelectField,
  parameters: {
    layout: "padded",
    chromatic: {
      disableSnapshot: true,
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
            "Array<{ value: string; label: string; icon?: IconName | React.ComponentType<{ className?: string }>; disabled?: boolean }>",
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

    selectionIcon: {
      control: "radio",
      options: ["auto", "checkmark"],
      description:
        "Selection icon to show in the options. " +
        "auto: Show a Radio for Single Select and a Checkbox for Multi Select. " +
        "checkmark: Show a checkmark icon for Single and Multi Select. ",
      table: {
        type: { summary: '"auto" | "checkmark"' },
        defaultValue: { summary: '"auto"' },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    selectionIconPosition: {
      control: "radio",
      options: ["left", "right"],
      description:
        'Selection icon position in options. Only apply if "selectionIcon" is "checkmark".',
      table: {
        type: { summary: '"left" | "right"' },
        defaultValue: { summary: '"left"' },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
      if: { arg: "selectionIcon", eq: "checkmark" },
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
    name: "select-field",
    errors: [],
    warnings: [],
  },
} satisfies Meta<typeof SelectField>;

export default meta;
type Story = StoryObj<typeof SelectField>;

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

// Basic examples
export const Default: Story = {
  args: {
    label: "Favorite icon name",
    options: defaultOptions,
    placeholder: "Select an icon name",
  },
};

export const WithDescription: Story = {
  args: {
    label: "Favorite icon name",
    description: "Choose your favorite icon name",
    options: defaultOptions,
    placeholder: "Select an icon name",
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
    placeholder: "Select an icon name",
    defaultValue: "Drive",
  },
};

export const Disabled: Story = {
  args: {
    label: "Disabled field",
    options: defaultOptions,
    placeholder: "Select an icon name",
    value: "Drive",
    disabled: true,
  },
};

// Validation states
export const WithError: Story = {
  args: {
    label: "With error",
    options: defaultOptions,
    placeholder: "Select icon names",
    value: ["Drive"],
    multiple: true,
    errors: ["Please select at least two options"],
  },
};

export const WithWarning: Story = {
  args: {
    label: "With warning",
    options: defaultOptions,
    placeholder: "Select icon names",
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
    placeholder: "Select an icon name",
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
    placeholder: "Select an icon name",
  },
};

export const Multiple: Story = {
  args: {
    label: "Multi select",
    description: "You can select multiple options",
    options: defaultOptions,
    placeholder: "Select icon names",
    multiple: true,
  },
};

export const WithCheckmark: Story = {
  args: {
    label: "With checkmark",
    description: "This select field shows a checkmark icon for selected option",
    options: defaultOptions,
    selectionIcon: "checkmark",
    placeholder: "Select an icon name",
  },
};

export const WithIcon: Story = {
  args: {
    label: "Favorite icon",
    description: "Choose your favorite icon",
    options: defaultOptionsWithIcon,
    selectionIcon: "checkmark",
    selectionIconPosition: "right",
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
      },
      ...defaultOptions,
    ],
    placeholder: "Select an option",
  },
};
