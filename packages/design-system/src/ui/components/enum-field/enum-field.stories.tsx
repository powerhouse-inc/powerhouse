import type { IconName } from "@powerhousedao/design-system";
import { Icon } from "@powerhousedao/design-system";
import type { Meta, StoryObj } from "@storybook/react";

import {
    getDefaultArgTypes,
    getValidationArgTypes,
    StorybookControlCategory,
    withForm,
} from "@powerhousedao/design-system";
import { EnumField } from "./enum-field.js";

const meta: Meta<typeof EnumField> = {
  title: "UI/Enum Field",
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
      options: ["auto", "RadioGroup", "Select"],
      description:
        "Enum field variant. " +
        "auto: uses the most appropriate variant based on the number of options " +
        "(less than 6 options -> RadioGroup, 6 options or more -> Select). " +
        "RadioGroup: displays options in a group of radio buttons. " +
        "Select: displays options in a dropdown menu.",
      table: {
        type: { summary: '"auto" | "RadioGroup" | "Select"' },
        defaultValue: { summary: "auto" },
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
    name: "enum-field",
    errors: [],
    warnings: [],
  },
} satisfies Meta<typeof EnumField>;

export default meta;

type Story = StoryObj<typeof EnumField>;

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

type StoryProps = {
  variant: "auto" | "RadioGroup" | "Select";
  [key: string]: any;
};

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
  } as StoryProps,
};

export const Required: Story = {
  args: {
    label: "Required field",
    variant: "RadioGroup",
    options: defaultOptions,
    placeholder: "Choose from the list",
    required: true,
  } as StoryProps,
};

export const WithDefaultValue: Story = {
  args: {
    label: "Preset selection",
    variant: "RadioGroup",
    options: defaultOptions,
    placeholder: "Choose from the list",
    defaultValue: "Drive",
  } as StoryProps,
};

export const Disabled: Story = {
  args: {
    label: "Disabled field",
    variant: "RadioGroup",
    options: defaultOptions,
    placeholder: "Choose from the list",
    value: "Drive",
    disabled: true,
  } as StoryProps,
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
  } as StoryProps,
};

export const WithWarning: Story = {
  args: {
    label: "With warning",
    variant: "RadioGroup",
    options: defaultOptions,
    placeholder: "Choose from the list",
    value: "Drive",
    warnings: ["This option may be deprecated soon"],
  } as StoryProps,
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
    selectionIcon: "checkmark",
    placeholder: "Select an icon name",
  },
};

export const SelectWithIcon: Story = {
  args: {
    label: "Favorite icon",
    description: "Choose your favorite icon",
    variant: "Select",
    options: defaultOptionsWithIcon,
    selectionIcon: "checkmark",
    selectionIconPosition: "right",
    placeholder: "Select an icon",
  },
};
