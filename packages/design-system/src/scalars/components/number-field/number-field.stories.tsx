import type { Meta, StoryObj } from "@storybook/react";
import { NumberField } from "./number-field";
import { withForm } from "@/scalars/lib/decorators";
import { useState } from "react";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
} from "@/scalars/lib/storybook-arg-types";

const meta = {
  title: "Document Engineering/Simple Components/Number Field",
  component: NumberField,
  parameters: {
    layout: "centered",
  },
  decorators: [withForm],
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes({
      valueControlType: "number",
      valueType: "number",
    }),
    step: {
      control: "number",
      description: "Step value for the input field",
      table: {
        type: { summary: "number" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    isBigInt: {
      control: "boolean",
      description:
        "Indicates whether the input value should be treated as a BigInt. When true, the value can represent large integers beyond the safe integer limit of JavaScript.",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    numericType: {
      control: "text",
      description:
        "Specifies the numeric type of the input field. Possible values are:\n\n\n" +
        "- PositiveInt: Positive whole numbers (e.g., 1, 2, 3)\n\n" +
        "- NegativeInt: Negative whole numbers (e.g., -1, -2, -3)\n\n" +
        "- NonNegativeInt: Zero and positive whole numbers (e.g., 0, 2)\n\n" +
        "- NonPositiveInt: Zero and negative whole numbers (e.g., 0, -2)\n\n" +
        "- PositiveFloat: Positive decimals (e.g., 1.0, 2.5)\n\n" +
        "- NegativeFloat: Negative decimals (e.g., -1.0, -2.5)\n\n" +
        "- NonNegativeFloat: Zero and positive decimals (e.g., 0.0, 1.0)\n\n" +
        "- NonPositiveFloat: Zero and negative decimals (e.g., 0.0, -1.0)\n\n" +
        "- BigInt: Large integers (e.g., 9999999999999999999)\n\n",
      table: {
        type: {
          summary:
            '"PositiveInt" | "NegativeInt" | "NonNegativeInt" | "NonPositiveInt" | "PositiveFloat" | "NegativeFloat" | "NonNegativeFloat" | "NonPositiveFloat" | "BigInt"',
        },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    ...PrebuiltArgTypes.placeholder,
    ...getValidationArgTypes(),
    ...PrebuiltArgTypes.minValue,
    ...PrebuiltArgTypes.maxValue,
    ...PrebuiltArgTypes.allowNegative,
    ...PrebuiltArgTypes.precision,
    ...PrebuiltArgTypes.trailingZeros,
    ...PrebuiltArgTypes.decimalRequired,
  },
  args: {
    name: "number-field",
    errors: [],
    warnings: [],
  },
} satisfies Meta<typeof NumberField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: "Label",
    label: "Label",
    placeholder: "0",
    showErrorOnBlur: true,
  },
};
export const Active: Story = {
  args: {
    name: "Label",
    label: "Label",
    autoFocus: true,
  },
  parameters: {
    pseudo: { focus: true },
  },
};
export const Disable: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 1234,
    disabled: true,
  },
};
export const Required: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 345,
    required: true,
  },
};
export const WithWarning: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 23,
    warnings: ["Warning message"],
  },
};
export const WithError: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 23,
    errors: ["Error message"],
  },
};
export const WithMultipleErrors: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 23,
    errors: [
      "Error message number 1",
      "Error message number 2",
      "Error message number 3",
      "Error message number 4",
    ],
  },
};

export const WithValue: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 23,
  },
};

export const WithDescription: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 0,
    description: "This is the field description",
  },
};

// Float Stories
export const WithFloatNumber: Story = {
  args: {
    label: "Label",
    name: "Label",
    // Allow trailing zeros after the decimal point for clarity in displaying fractional values.
    // eslint-disable-next-line prettier/prettier
    value: 0.0,
    precision: 2,
    trailingZeros: true,
  },
};
// BigInt Stories
export const WithBigInt: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: "9999999999999999999",
    isBigInt: true,
  },
};

// Step Stories
export const WithStep: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 456,
    step: 10,
    minValue: 20,
  },
};