import type { Meta, StoryObj } from "@storybook/react";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
} from "../../../../scalars/lib/storybook-arg-types.js";
import { TextInput } from "./text-input.js";

/**
 * The `TextInput` component provides a standard text input field with various features.
 * It supports labels, descriptions, validation states, and text transformations.
 *
 * > **Note:** This component does not have built-in validation. If you need built-in validation
 * > you can use the [StringField](?path=/docs/document-engineering-scalars-string-field--readme)
 * > component.
 */
const meta = {
  title: "Document Engineering/Data Entry/Text Input",
  component: TextInput,
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
      valueControlType: "text",
      valueType: "string",
    }),
    ...PrebuiltArgTypes.placeholder,
    ...PrebuiltArgTypes.autoComplete,
    ...PrebuiltArgTypes.spellCheck,
    ...PrebuiltArgTypes.trim,
    ...PrebuiltArgTypes.uppercase,
    ...PrebuiltArgTypes.lowercase,

    ...getValidationArgTypes({
      enabledArgTypes: {
        validators: false,
        showErrorOnBlur: false,
        showErrorOnChange: false,
      },
    }),
    ...PrebuiltArgTypes.minLength,
    ...PrebuiltArgTypes.maxLength,
    ...PrebuiltArgTypes.pattern,

    ...PrebuiltArgTypes.viewMode,
    ...PrebuiltArgTypes.diffMode,
    ...PrebuiltArgTypes.baseValue,
  },
} satisfies Meta<typeof TextInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Username",
    placeholder: "Enter your username",
  },
};

export const WithValue: Story = {
  args: {
    label: "Username",
    defaultValue: "jhon.doe",
    placeholder: "Enter your username",
  },
};

export const WithDescription: Story = {
  args: {
    label: "Username",
    description: "Must be at least 3 characters long",
    placeholder: "Enter your username",
  },
};

export const Required: Story = {
  args: {
    label: "Username",
    required: true,
    placeholder: "Enter your username",
  },
};

export const Disabled: Story = {
  args: {
    label: "Username",
    disabled: true,
    defaultValue: "jhon.doe",
    placeholder: "Enter your username",
  },
};

export const WithErrors: Story = {
  args: {
    label: "Username",
    defaultValue: "invalid-username",
    errors: ["Please enter a valid username"],
    placeholder: "Enter your username",
  },
};

export const WithWarnings: Story = {
  args: {
    label: "Username",
    defaultValue: "no",
    warnings: ["Username must be at least 3 characters long"],
    placeholder: "Enter your username",
  },
};
