import type { Meta, StoryObj } from "@storybook/react";
import { withForm } from "@/scalars/lib/decorators";
import { AmountField } from "./amount-field";

const meta = {
  title: "Document Engineering/Complex Components/AmountField",
  component: AmountField,
  decorators: [withForm],
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    name: {
      control: "text",
      description: "Name attribute for the input field",
      table: {
        type: { summary: "string" },
      },
    },
    label: {
      control: "text",
      description: "Label text displayed above the input field",
      table: {
        type: { summary: "string" },
      },
    },
    description: {
      control: "text",
      description: "Helper text displayed below the input field",
      table: {
        type: { summary: "string" },
      },
    },
    value: {
      control: "number",
      description: "Controlled value of the input field",
      table: {
        type: { summary: "number" },
      },
    },
    required: {
      control: "boolean",
      description: "Whether the field is required",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
      },
    },
    disabled: {
      control: "boolean",
      description: "Whether the input field is disabled",
      table: {
        defaultValue: { summary: "false" },
        type: { summary: "boolean" },
      },
    },
    placeholder: {
      control: "text",
      description: "Placeholder text shown when field is empty",
      table: {
        type: { summary: "string" },
      },
    },
    minValue: {
      control: "number",
      description: "Minimum number of characters allowed",
      table: {
        type: { summary: "number" },
      },
    },
    maxValue: {
      control: "number",
      description: "Maximum number of characters allowed",
      table: {
        type: { summary: "number" },
      },
    },
    errors: {
      control: "object",
      description: "Array of error messages to display below the field",
      table: {
        defaultValue: { summary: "[]" },
        type: { summary: "string[]" },
      },
    },
    warnings: {
      control: "object",
      description: "Array of warning messages to display below the field",
      table: { defaultValue: { summary: "[]" }, type: { summary: "string[]" } },
    },
    allowNegative: {
      control: "boolean",
      description: "Allows the input field to accept negative numbers",
      table: { type: { summary: "boolean" } },
    },
    precision: {
      control: "number",
      description: "Number of decimal places allowedd",
      table: { type: { summary: "number" } },
    },
    trailingZeros: {
      control: "boolean",
      description:
        "When precision is set, for example to 2, determines if the the trailing zeros should be preserved ( for example: 25.00,7.50, etc.) or not ( for example: 25, 7.5).",
      table: { type: { summary: "boolean" } },
    },
    type: {
      control: "select",
      options: [
        "Amount",
        "AmountCurrency",
        "AmountToken",
        "AmountToken",
        "AmountPercentage",
      ],
      description:
        "Value types: Amount, AmountCurrency, AmountFiat, AmountToken, and AmountPercentage.",
      table: { type: { summary: "boolean" } },
    },
  },
  args: {
    errors: [],
    warnings: [],
    name: "amount-field",
  },
} satisfies Meta<typeof AmountField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Enter Amount ",
    name: "amount",
    type: "Amount",
    value: {
      amount: 300,
    },
  },
};
export const DefaultWithPercent: Story = {
  args: {
    label: "Enter Percentage",
    name: "amount",
    type: "AmountPercentage",
    value: {
      amount: 300,
    },
  },
};
export const DisableWithPercent: Story = {
  args: {
    label: "Enter Percentage ",
    name: "amount",
    type: "AmountPercentage",
    value: {
      amount: 300,
    },
    disabled: true,
  },
};

export const ActiveWithPercent: Story = {
  args: {
    label: "Enter Percentage ",
    name: "amount",
    type: "AmountPercentage",
    value: {
      amount: 300,
    },
    autoFocus: true,
  },
};
