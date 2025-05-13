import type { Meta, StoryObj } from "@storybook/react";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  StorybookControlCategory,
} from "../../../../scalars/lib/storybook-arg-types.js";
import { Toggle } from "./toggle.js";

/**
 * The `Toggle` component provides a simple on/off control similar to a light switch.
 * It is based on Radix UI's Switch component and styled according to the design system.
 *
 * The component supports different states such as on (checked), off (unchecked), disabled,
 * and can display error states. It also supports labels, descriptions, and validation messages.
 *
 * > **Note:** This component does not have built-in validation. If you need built-in validation
 * > you can use the [BooleanField](?path=/docs/document-engineering-scalars-boolean-field--readme)
 * > component and set the `isToggle` prop to `true`.
 */
const meta = {
  title: "Document Engineering/Data Entry/Toggle",
  component: Toggle,
  parameters: {
    layout: "centered",
    chromatic: {
      disableSnapshot: true,
    },
  },
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes({
      enabledArgTypes: {
        id: false,
      },
      valueControlType: "boolean",
      valueType: "boolean",
    }),

    ...getValidationArgTypes({
      enabledArgTypes: {
        validators: false,
        showErrorOnBlur: false,
        showErrorOnChange: false,
      },
    }),
    optionalLabel: {
      control: "text",
      description: "The label of the optional field",
      table: {
        category: StorybookControlCategory.DIFF,
      },
    },
    viewMode: {
      control: "select",
      description: "The mode of the input field",
      options: ["edition", "addition", "removal"],
      table: {
        type: { summary: "edition | addition | removal" },
        defaultValue: { summary: "edition" },
        category: StorybookControlCategory.DIFF,
      },
    },
    baseValue: {
      control: "boolean",
      description: "The base value of the input field",
      table: {
        category: StorybookControlCategory.DIFF,
      },
    },
  },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Enable notifications",
  },
};

export const Checked: Story = {
  args: {
    label: "Notifications enabled",
    defaultValue: true,
  },
};

export const WithDescription: Story = {
  args: {
    label: "Dark mode",
    description: "Switch between light and dark theme",
  },
};

export const Required: Story = {
  args: {
    label: "Accept usage tracking",
    required: true,
  },
};

export const Disabled: Story = {
  args: {
    label: "This feature is disabled",
    disabled: true,
  },
};

export const WithErrors: Story = {
  args: {
    label: "Enable feature",
    errors: ["This feature requires admin privileges"],
  },
};

export const WithWarnings: Story = {
  args: {
    label: "Enable experimental features",
    warnings: ["Experimental features may be unstable"],
  },
};

export const WithErrorsAndWarnings: Story = {
  args: {
    label: "Allow third-party access",
    errors: ["This setting requires additional verification"],
    warnings: ["Enabling this will share your data with third parties"],
  },
};
