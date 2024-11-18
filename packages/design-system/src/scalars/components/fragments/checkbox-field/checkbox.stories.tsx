import { Meta, StoryObj } from "@storybook/react";
import { CheckboxField } from "./checkbox-field";
import { withForm } from "@/scalars/lib/decorators";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
} from "@/scalars/lib/storybook-arg-types";

const meta: Meta<typeof CheckboxField> = {
  component: CheckboxField,
  title: "Document Engineering/Fragments/Checkbox Field",
  tags: ["autodocs"],
  decorators: [withForm],
  argTypes: {
    ...getDefaultArgTypes({
      valueControlType: "boolean",
      valueType: "boolean",
    }),
    ...getValidationArgTypes({
      enabledArgTypes: {
        customValidator: false,
      },
    }),
  },
  args: {
    errors: [],
    warnings: [],
    name: "checkbox",
  },
};

export default meta;

type Story = StoryObj<typeof CheckboxField>;

export const Default: Story = {
  args: {
    value: false,
    disabled: false,
    label: "Default Checkbox",
  },
};

export const Checked: Story = {
  args: {
    value: true,
    label: "Checked Checkbox",
  },
};

export const Indeterminate: Story = {
  args: {
    value: undefined,
    label: "Indeterminate Checkbox",
  },
};

export const Disabled: Story = {
  args: {
    value: false,
    disabled: true,
    label: "Disabled Checkbox",
  },
};

export const CheckedAndDisabled: Story = {
  args: {
    value: true,
    disabled: true,
    label: "Checked and Disabled Checkbox",
  },
};

export const Required: Story = {
  args: {
    value: false,
    required: true,
    label: "Required Checkbox",
  },
};

export const WithDescription: Story = {
  args: {
    value: false,
    description: "This is a description",
    label: "Checkbox with description",
  },
};

export const RequiredWithDescription: Story = {
  args: {
    value: false,
    description: "This is a description",
    label: "Required Checkbox with description",
    required: true,
  },
};

export const WithCustomLabel: Story = {
  args: {
    value: false,
    label: (
      <span>
        I agree to the{" "}
        <a
          className="underline"
          href="https://google.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          terms of service
        </a>
      </span>
    ),
  },
};

export const WithErrors: Story = {
  args: {
    value: false,
    label: "Checkbox with Errors",
    errors: ["This field is required", "Another error"],
  },
};

export const WithWarningsAndErrors: Story = {
  args: {
    value: false,
    label: "Checkbox with Warnings and Errors",
    warnings: ["This is a warning", "Another warning"],
    errors: ["This is an error", "Another error"],
  },
};
