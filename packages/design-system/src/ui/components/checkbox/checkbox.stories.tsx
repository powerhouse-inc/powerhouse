import type { Meta, StoryObj } from "@storybook/react";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  StorybookControlCategory,
} from "../../lib/storybook-arg-types.js";
import { Checkbox } from "./checkbox.js";

/**
 * The `Checkbox` component allows users to select one or more items from a set.
 * It is based on Radix UI's Checkbox component and styled according to the design system.
 *
 * The component supports different states such as checked, unchecked, indeterminate, disabled,
 * and can display error states. It also supports labels, descriptions, and validation messages.
 *
 * > **Note:** This component does not have built-in validation. If you need built-in validation
 * > you can use the [BooleanField](?path=/docs/document-engineering-scalars-boolean-field--readme)
 * > component.
 */
const meta = {
  title: "UI/Checkbox",
  component: Checkbox,
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
        value: false,
        id: false,
      },
      valueControlType: "boolean",
      valueType: "boolean",
    }),

    value: {
      control: "inline-radio",
      options: ["indeterminate", true, false],
      description: "Current value of the input field",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.DEFAULT,
      },
    },

    ...getValidationArgTypes({
      enabledArgTypes: {
        validators: false,
        showErrorOnBlur: false,
        showErrorOnChange: false,
      },
    }),
  },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Accept terms and conditions",
  },
};

export const Checked: Story = {
  args: {
    label: "Accept terms and conditions",
    defaultValue: true,
  },
};

export const Indeterminate: Story = {
  args: {
    label: "Select some items",
    defaultValue: "indeterminate",
  },
};

export const WithDescription: Story = {
  args: {
    label: "Subscribe to newsletter",
    description: "Receive updates about our product",
  },
};

export const Required: Story = {
  args: {
    label: "I agree to the terms and conditions",
    required: true,
  },
};

export const Disabled: Story = {
  args: {
    label: "This option is disabled",
    disabled: true,
  },
};

export const WithErrors: Story = {
  args: {
    label: "Accept terms",
    errors: ["You must accept the terms to continue"],
  },
};

export const WithWarnings: Story = {
  args: {
    label: "Share my data",
    warnings: ["Your data will be shared with third-party services"],
  },
};

export const WithErrorsAndWarnings: Story = {
  args: {
    label: "Accept privacy policy",
    errors: ["This field is required"],
    warnings: ["Please review our privacy policy carefully"],
  },
};
