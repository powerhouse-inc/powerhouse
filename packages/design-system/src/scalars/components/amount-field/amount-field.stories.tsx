import type { Meta, StoryObj } from "@storybook/react";
import { withForm } from "@/scalars/lib/decorators";
import { AmountField } from "./amount-field";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
} from "@/scalars/lib/storybook-arg-types";

const meta = {
  title: "Document Engineering/Simple Components/Amount Field",
  component: AmountField,
  decorators: [withForm],
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    allowedCurrencies: {
      control: "object",
      description:
        "Array of custom error messages. These errors are going to be added to the internal validation errors if there's any.",
      table: {
        type: { summary: "string[]" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    selectName: {
      control: "object",
      description: "Add the label for the select",
      table: {
        type: { summary: "string" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    isBigInt: {
      control: "boolean",
      description: "Indicates if the input field should allow BigInt values",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    numberProps: {
      control: "object",
      description: "All the props options for number field",
      table: {
        type: { summary: "string" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    selectProps: {
      control: "object",
      description: "All the props options for select field",
      table: {
        type: { summary: "string" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    // TODO:Improve the AmountType descriptions for the value
    ...getDefaultArgTypes({
      valueControlType: "object",
      valueType: "object",
    }),
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
    errors: [],
    warnings: [],
    name: "amount-field",
  },
} satisfies Meta<typeof AmountField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Currency: Story = {
  args: {
    selectName: "currency",
    label: "Enter Amount and Select Currency",
    name: "amount",
    type: "AmountCurrency",
    allowedCurrencies: ["USD", "EUR"],
    value: {
      amount: 345,
      currency: "USD",
    },
  },
};

export const Default: Story = {
  args: {
    selectName: "currency",
    label: "Enter Amount ",
    name: "amount",
    type: "Amount",
    value: 345,
  },
};
export const Percent: Story = {
  args: {
    selectName: "currency",
    label: "Enter Percentage ",
    name: "amount",
    type: "AmountPercentage",
    value: 9,
  },
};

export const PercentWithActive: Story = {
  args: {
    selectName: "currency",
    label: "Enter Percentage ",
    name: "amount",
    type: "AmountPercentage",
    value: 345,
    numberProps: {
      autoFocus: true,
    },
  },
  parameters: {
    pseudo: { focus: true },
  },
};
export const PercentWithDisable: Story = {
  args: {
    selectName: "currency",
    label: "Enter Percentage ",
    name: "amount",
    type: "AmountPercentage",
    defaultValue: 345,
  },
};

export const CurrencyWithDisable: Story = {
  args: {
    selectName: "currency",
    label: "Enter Amount and Select Currency",
    name: "amount",
    allowedCurrencies: ["USD", "EUR"],
    type: "AmountCurrency",
    value: {
      amount: 345,
      currency: "USD",
    },
    disabled: true,
  },
};
export const CurrencyWithActive: Story = {
  args: {
    selectName: "currency",
    label: "Enter Amount and Select Currency",
    name: "amount",
    allowedCurrencies: ["USD", "EUR"],
    type: "AmountCurrency",
    value: {
      amount: 345,
      currency: "USD",
    },
    numberProps: {
      autoFocus: true,
    },
  },
};

export const HoverWithCurrency: Story = {
  args: {
    selectName: "currency",
    label: "Enter Amount and Select Currency",
    name: "amount",
    allowedCurrencies: ["USD", "EUR"],
    type: "AmountCurrency",
    value: {
      amount: 345,
      currency: "USD",
    },
  },
  parameters: {
    pseudo: {
      hover: true,
    },
  },
};
export const Required: Story = {
  args: {
    selectName: "currency",
    label: "Enter Amount and Select Currency",
    name: "amount",
    allowedCurrencies: ["USD", "EUR"],
    required: true,
    type: "AmountCurrency",
    value: {
      amount: 345,
      currency: "USD",
    },
  },
};
export const WithWarning: Story = {
  args: {
    selectName: "currency",
    name: "Label",
    label: "Label",
    type: "AmountCurrency",
    allowedCurrencies: ["USD", "EUR"],
    value: {
      amount: 345,
      currency: "USD",
    },
    warnings: ["Warning message"],
  },
};
export const WithError: Story = {
  args: {
    selectName: "currency",
    name: "Label",
    label: "Label",
    type: "AmountCurrency",
    allowedCurrencies: ["USD", "EUR"],
    value: {
      amount: 345,
      currency: "USD",
    },
    errors: ["Error message"],
  },
};
export const WithMultipleErrors: Story = {
  args: {
    selectName: "currency",
    name: "Label",
    label: "Label",
    type: "AmountCurrency",
    allowedCurrencies: ["USD", "EUR"],
    value: {
      amount: 345,
      currency: "USD",
    },
    errors: [
      "Error message number 1",
      "Error message number 2",
      "Error message number 3",
      "Error message number 4",
    ],
  },
};
