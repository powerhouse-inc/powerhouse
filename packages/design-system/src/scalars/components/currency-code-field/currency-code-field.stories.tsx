import type { Meta, StoryObj } from "@storybook/react";
import { CurrencyCodeField } from "./currency-code-field";
import { withForm } from "@/scalars/lib/decorators";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  StorybookControlCategory,
} from "@/scalars/lib/storybook-arg-types";

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

    allowedCurrencies: {
      control: "object",
      description: "List of allowed currency codes",
      table: {
        type: { summary: "string[]" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    excludedCurrencies: {
      control: "object",
      description: "List of excluded currency codes",
      table: {
        type: { summary: "string[]" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    multiple: {
      control: "boolean",
      description: "Whether to allow multiple selections",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    includeCurrencySymbols: {
      control: "boolean",
      description: "Whether to show currency symbols in options",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    enableAutocomplete: {
      control: "boolean",
      description: "Enable search/autocomplete functionality",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    showFlagIcons: {
      control: "boolean",
      description: "Show country flag icons next to currency codes",
      table: {
        type: { summary: "boolean" },
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
  },
};

export const WithDescription: Story = {
  args: {
    label: "Payment Currency",
    description: "Select the currency for your payment",
  },
};

export const Required: Story = {
  args: {
    label: "Transaction Currency",
    required: true,
  },
};

export const Multiple: Story = {
  args: {
    label: "Currency",
    multiple: true,
  },
};

export const Disabled: Story = {
  args: {
    label: "Currency",
    value: "EUR",
    disabled: true,
  },
};

export const WithError: Story = {
  args: {
    label: "Currency",
    value: "XXX",
    errors: ["Please select a valid currency"],
  },
};

export const WithWarning: Story = {
  args: {
    label: "Currency",
    value: "BTC",
    warnings: ["Cryptocurrency is not supported"],
  },
};

export const WithAllowedCurrencies: Story = {
  args: {
    label: "Currency",
    allowedCurrencies: ["USD", "EUR", "GBP"],
  },
};

export const WithExcludedCurrencies: Story = {
  args: {
    label: "Currency",
    excludedCurrencies: ["BTC", "ETH", "DOGE"],
  },
};

export const WithFlagIcons: Story = {
  args: {
    label: "Currency",
    showFlagIcons: true,
  },
};

export const WithCurrencySymbols: Story = {
  args: {
    label: "Currency",
    includeCurrencySymbols: true,
  },
};

export const WithMaxSelection: Story = {
  args: {
    label: "Currency",
    multiple: true,
    maxSelection: 2,
    description:
      "You can select up to 2 currencies only, more than 2 will raise an error",
  },
};
