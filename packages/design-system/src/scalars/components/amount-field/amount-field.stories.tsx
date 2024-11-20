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
  title: "Document Engineering/Complex Components/AmountField",
  component: AmountField,
  decorators: [withForm],
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    // TODO:Improve the AmountType descriptions

    allowedCurrencies: {
      control: "object",
      description:
        "Array of custom error messages. These errors are going to be added to the internal validation errors if there's any.",
      table: {
        type: { summary: "string[]" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
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
    ...getDefaultArgTypes({
      valueControlType: "AmountType",
      valueType: "AmountType",
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

export const Default: Story = {
  args: {
    selectName: "currency",
    label: "Enter Amount ",
    name: "amount",
    value: {
      type: "Amount",
      details: {
        amount: 345,
      },
    },
  },
};
export const DefaultWithPercent: Story = {
  args: {
    selectName: "currency",
    label: "Enter Percentage",
    name: "amount",
    value: {
      type: "AmountPercentage",
      details: {
        amount: 345,
      },
    },
  },
};
export const DisableWithPercent: Story = {
  args: {
    selectName: "currency",
    label: "Enter Percentage ",
    name: "amount",
    value: {
      type: "AmountPercentage",
      details: {
        amount: 345,
      },
    },
    disabled: true,
  },
};

export const ActiveWithPercent: Story = {
  args: {
    selectName: "currency",
    label: "Enter Percentage ",
    name: "amount",
    value: {
      type: "AmountPercentage",
      details: {
        amount: 345,
      },
    },

    numberProps: {
      autoFocus: true,
    },
  },
};

export const DefaultWithCurrency: Story = {
  args: {
    selectName: "currency",
    label: "Enter Amount and Select Currency",
    name: "amount",
    allowedCurrencies: ["USD", "EUR"],
    value: {
      type: "AmountCurrency",
      details: {
        amount: 345,
        currency: "USD",
      },
    },
  },
};

export const ActiveWithCurrency: Story = {
  args: {
    selectName: "currency",
    label: "Enter Amount and Select Currency",
    name: "amount",
    allowedCurrencies: ["USD", "EUR"],
    autoFocus: true,
    value: {
      type: "AmountCurrency",
      details: {
        amount: 345,
        currency: "USD",
      },
    },
    numberProps: {
      autoFocus: true,
    },
  },
};
export const DisableWithCurrency: Story = {
  args: {
    selectName: "currency",
    label: "Enter Amount and Select Currency",
    name: "amount",
    allowedCurrencies: ["USD", "EUR"],
    value: {
      type: "AmountCurrency",
      details: {
        amount: 345,
        currency: "USD",
      },
    },
    disabled: true,
  },
};
export const HoverWithCurrency: Story = {
  args: {
    selectName: "currency",
    label: "Enter Amount and Select Currency",
    name: "amount",
    allowedCurrencies: ["USD", "EUR"],
    value: {
      type: "AmountCurrency",
      details: {
        amount: 345,
        currency: "USD",
      },
    },
  },
  parameters: {
    pseudo: {
      hover: true,
    },
  },
};
