import type { Meta, StoryObj } from "@storybook/react";
import { withForm } from "@/scalars/lib/decorators";
import { AmountField } from "./amount-field";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
} from "@/scalars/lib/storybook-arg-types";
import { Icon, IconName } from "@/powerhouse";

const meta = {
  title: "Document Engineering/Simple Components/Amount Field",
  component: AmountField,
  decorators: [withForm],
  parameters: {
    layout: "centered",
    form: {
      defaultValues: {
        "amount-field": {
          amount: undefined,
          currency: "",
        },
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    allowedCurrencies: {
      control: "object",
      description:
        "Array of strings — List of accepted fiat currency codes (e.g., ['USD', 'EUR', 'GBP']).",
      table: {
        type: { summary: "string[]" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
      if: {
        arg: "type",
        neq: ["Amount", "AmountPercentage"],
      },
    },
    allowedTokens: {
      control: "object",
      description:
        "Array of strings — List of accepted cryptocurrency codes (e.g., ['BTC', 'ETH', 'USDT']).",
      table: {
        type: { summary: "string[]" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    tokenIcons: {
      control: "object",
      description:
        "Mapping of token identifiers to icon references (e.g., { 'BTC': 'icon-btc', 'ETH': 'icon-eth' }).",
      table: {
        type: { summary: "object" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    step: {
      control: "number",
      description: "The step value for the amount field",
      table: {
        defaultValue: { summary: "1" },
        type: { summary: "number" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    currencyPosition: {
      control: "select",
      options: ["left", "right"],
      description:
        "Determines the position of the currency select dropdown relative to the amount input field.",
      table: {
        defaultValue: { summary: "right" },
        type: { summary: "string" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    trailingZeros: {
      control: "boolean",
      description:
        "When precision is set, for example to 2, determines if the the trailing zeros should be preserved ( for example: 25.00,7.50, etc.) or not ( for example: 25, 7.5).",
      if: {
        arg: "type",
        neq: "AmountToken",
      },
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.VALIDATION,
      },
    },
    viewPrecision: {
      control: "number",
      description: "Number of decimal places viewed",
      table: {
        type: { summary: "number" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    precision: {
      control: "number",
      description: "Number of decimal places viewed",
      table: {
        type: { summary: "number" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    allowNegative: {
      control: "boolean",
      description: "Whether negative values are allowed (true or false).",
      table: {
        defaultValue: { summary: "false" },
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
    ...getDefaultArgTypes(),

    value: {
      control: "object",
      description:
        "The value of the amount field. Can be a number, an object with currency, or undefined. Examples: { amount: 100, currency: 'USD' }, 200, undefined.",
      table: {
        type: { summary: "object | number | undefined" },
        category: StorybookControlCategory.DEFAULT,
      },
    },
    ...PrebuiltArgTypes.placeholder,
    ...getValidationArgTypes(),
    ...PrebuiltArgTypes.minValue,
    ...PrebuiltArgTypes.maxValue,
    type: {
      control: "select",
      options: [
        "Amount",
        "AmountCurrencyFiat",
        "AmountPercentage",
        "AmountCurrencyCrypto",
        "AmountCurrencyUniversal",
      ],
      description: "The type of amount field.",
      table: {
        type: { summary: "string" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
  },

  args: {
    name: "amount-field",
  },
} satisfies Meta<typeof AmountField>;

const IconComponent = (name: IconName) => {
  return () => <Icon name={name} size={16} />;
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: "0",
    label: "Enter Amount and Select Currency",
    placeholderSelect: "CUR",
    type: "AmountCurrencyFiat",
    allowedCurrencies: ["USD", "EUR"],
    value: {
      amount: undefined,
      currency: "",
    },
  },
};

export const WithValue: Story = {
  args: {
    placeholder: "Enter Amount",
    placeholderSelect: "CUR",
    label: "Enter Amount and Select Currency",
    type: "AmountCurrencyFiat",
    allowedCurrencies: ["USD", "EUR"],
    value: {
      currency: "USD",
      amount: 100,
    },
  },
};
export const WithAmount: Story = {
  parameters: {
    form: {
      defaultValues: {
        "amount-field": "",
      },
    },
  },
  args: {
    placeholder: "Enter Amount",
    label: "EnterAmout ",
    type: "Amount",
    value: 345,
  },
};
export const CurrencyIcon: Story = {
  args: {
    placeholder: "Enter Amount",
    label: "Enter Amount and Select Currency",
    type: "AmountCurrencyCrypto",
    placeholderSelect: "CUR",
    allowedTokens: ["BTC", "ETH"],
    tokenIcons: {
      BTC: IconComponent("Briefcase"),
      ETH: IconComponent("Briefcase"),
    },
    value: {
      amount: 3454564564 as unknown as bigint,
      currency: "BTC",
    },
  },
};

export const WithToken: Story = {
  parameters: {
    form: {
      defaultValues: {
        "amount-field": {
          amount: "",
          currency: "BTC",
        },
      },
    },
  },
  args: {
    placeholder: "Enter Amount",
    label: "Enter Amount and Select Currency",
    type: "AmountCurrencyCrypto",
    placeholderSelect: "CUR",
    allowedTokens: ["BTC", "ETH", "USDT"],
    value: {
      amount: 123 as unknown as bigint,
      currency: "BTC",
    },
  },
};

export const WithValuePercent: Story = {
  parameters: {
    form: {
      defaultValues: {
        "amount-field": "",
      },
    },
  },
  args: {
    label: "Enter Percentage ",
    placeholder: "Enter Amount",
    type: "AmountPercentage",
    value: 9,
  },
};
export const Disable: Story = {
  args: {
    label: "Enter Amount ",
    placeholder: "Enter Amount",
    type: "AmountCurrencyFiat",
    allowedCurrencies: ["USD", "EUR"],
    disabled: true,
    value: {
      amount: 9,
      currency: "USD",
    },
  },
};

export const WithValueUniversalAmountCurrency: Story = {
  parameters: {
    form: {
      defaultValues: {
        "amount-field": {
          amount: 123,
          currency: "USD",
        },
      },
    },
  },
  args: {
    label: "Label",
    placeholder: "Enter Amount",
    type: "AmountCurrencyUniversal",
    allowedCurrencies: ["USD", "EUR"],
    value: {
      amount: 123,
      currency: "USD",
    },
  },
};
