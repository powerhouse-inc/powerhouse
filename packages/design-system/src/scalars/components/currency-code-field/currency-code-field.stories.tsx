import {
  getDefaultArgTypes,
  getValidationArgTypes,
  StorybookControlCategory,
  withForm,
} from "#scalars";
import type { Meta, StoryObj } from "@storybook/react";
import { CurrencyCodeField } from "./currency-code-field.js";
import { commonCryptoCurrencies, commonFiatCurrencies } from "./defaults.js";

const meta: Meta<typeof CurrencyCodeField> = {
  title: "Document Engineering/Simple Components/Currency Code Field",
  component: CurrencyCodeField,
  decorators: [withForm, (Story) => <div className="w-48">{Story()}</div>],
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes(),
    ...getValidationArgTypes(),

    currencies: {
      control: "object",
      description: "Array of Currency objects",
      table: {
        type: { summary: "Currency[]" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    includeCurrencySymbols: {
      control: "boolean",
      description: " Whether to display currency symbols alongside codes",
      table: {
        defaultValue: { summary: "true" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    allowedTypes: {
      control: "select",
      description: "Either Crypto, Fiat or Both",
      options: ["Fiat", "Crypto", "Both"],
      table: {
        defaultValue: { summary: "Both" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    favoriteCurrencies: {
      control: "object",
      description:
        "List of currencies to display at the top of the dropdown for quick access",
      table: {
        type: { summary: "string[]" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    symbolPosition: {
      control: "select",
      description: "Position of the currency symbol",
      options: ["left", "right"],
      table: {
        type: { summary: "string" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
      if: {
        arg: "includeCurrencySymbols",
        eq: true,
      },
    },
    searchable: {
      control: "boolean",
      description: "Whether the dropdown is searchable",
      table: {
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
  },

  args: {
    name: "currency-code-field",
    placeholder: "Select a currency",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Currency",
    currencies: commonCryptoCurrencies,
  },
};
export const FavoriteCurrencies: Story = {
  args: {
    label: "Currency",
    currencies: commonCryptoCurrencies,
    favoriteCurrencies: ["BTC", "ETH"],
  },
};

export const Disabled: Story = {
  args: {
    label: "Currency",
    value: "EUR",
    disabled: true,
    currencies: commonFiatCurrencies,
  },
};
