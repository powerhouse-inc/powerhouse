import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
  withForm,
} from "#scalars";
import type { Meta, StoryObj } from "@storybook/react";
import { NumberField } from "./number-field";

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
        defaultValue: { summary: "1" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    autoFocus: {
      table: {
        disable: true,
      },
    },
    numericType: {
      control: {
        type: "select",
      },
      options: [
        "PositiveInt",
        "NegativeInt",
        "NonNegativeInt",
        "NonPositiveInt",
        "PositiveFloat",
        "NegativeFloat",
        "NonNegativeFloat",
        "NonPositiveFloat",
        "BigInt",
        "Int",
        "Float",
      ],
      description:
        "Specifies the numeric type of the input field. Possible values are:\n\n\n" +
        "- PositiveInt: Positive whole numbers (1, 2, 3)\n" +
        "- NegativeInt: Negative whole numbers (-1, -2, -3)\n" +
        "- NonNegativeInt: Zero and positive whole numbers (0, 2)\n" +
        "- NonPositiveInt: Zero and negative whole numbers ( 0, -2)\n" +
        "- PositiveFloat: Positive decimals (1.0, 2.5)\n" +
        "- NegativeFloat: Negative decimals (-1.0, -2.5)\n" +
        "- NonNegativeFloat: Zero and positive decimals (0.0, 1.0)\n" +
        "- NonPositiveFloat: Zero and negative decimals (0.0, -1.0)\n" +
        "- BigInt: Large integers (9999999999999999)\n" +
        "- Float: Any decimal number (1.0, 2.5, -1.0, -2.5)\n" +
        "- Int: Any integer number, including positive (1, 2), negative (-1, -2), and zero\n",
      table: {
        defaultValue: { summary: "Float" },
        type: {
          summary:
            '"PositiveInt" | "NegativeInt" | "NonNegativeInt" | "NonPositiveInt" | "PositiveFloat" | "NegativeFloat" | "NonNegativeFloat" | "NonPositiveFloat" | "BigInt" | "Int" | "Float"',
        },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    ...PrebuiltArgTypes.placeholder,
    ...getValidationArgTypes(),
    ...PrebuiltArgTypes.minValue,
    ...PrebuiltArgTypes.maxValue,
    ...PrebuiltArgTypes.precision,
    ...PrebuiltArgTypes.trailingZeros,
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
    placeholder: "Enter a number",
    value: 1234,
  },
};
export const Active: Story = {
  args: {
    name: "Label",
    label: "Label",
    autoFocus: true,
    value: 45,
    placeholder: "Enter a number",
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
    placeholder: "A number is required",
  },
};
export const WithWarning: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 23,
    warnings: ["Warning message"],
    placeholder: "Enter  number",
  },
};
export const WithError: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 23,
    errors: ["Error message"],
    placeholder: "Enter a number",
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
    placeholder: "Enter a number",
  },
};

export const WithValue: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 23,
    placeholder: "Enter a number",
  },
};

export const WithDescription: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 0,
    description: "This is the field description",
    placeholder: "Enter a number",
  },
};

// Float Stories
export const WithFloatNumber: Story = {
  args: {
    label: "Label",
    name: "Label",
    value: 0.0,
    precision: 2,
    trailingZeros: true,
    placeholder: "Enter a decimal number",
  },
};
// BigInt Stories
export const WithBigInt: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 99992342343299,
    numericType: "BigInt",
    placeholder: "Enter a large number",
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
    placeholder: "Enter a number",
  },
};
