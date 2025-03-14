import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
  withForm,
} from "#scalars";
import type { Meta, StoryObj } from "@storybook/react";
import { CountryCodeField } from "./country-code-field.js";

const meta: Meta<typeof CountryCodeField> = {
  title: "Document Engineering/Simple Components/Country Code Field",
  component: CountryCodeField,
  decorators: [
    withForm,
    (Story) => (
      <div style={{ maxWidth: "280px", margin: "1rem auto 0" }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes(),
    ...PrebuiltArgTypes.placeholder,

    allowedCountries: {
      control: "object",
      description: "List of allowed country codes",
      table: {
        type: { summary: "string[]" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    excludedCountries: {
      control: "object",
      description: "List of country codes to exclude",
      table: {
        type: { summary: "string[]" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    includeDependentAreas: {
      control: "boolean",
      description: "Whether to include dependent territories in country list",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    viewMode: {
      control: "radio",
      options: ["CodesOnly", "NamesOnly", "NamesAndCodes"],
      description: "How to display country options in dropdown",
      table: {
        type: { summary: '"CodesOnly" | "NamesOnly" | "NamesAndCodes"' },
        defaultValue: { summary: '"NamesOnly"' },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    showFlagIcons: {
      control: "boolean",
      description: "Whether to show country flag icons",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "true" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    enableSearch: {
      control: "boolean",
      description: "Enable search functionality",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    ...getValidationArgTypes(),
  },
  args: {
    name: "country-code-field",
    errors: [],
    warnings: [],
  },
} satisfies Meta<typeof CountryCodeField>;

export default meta;

type Story = StoryObj<typeof CountryCodeField>;

export const Default: Story = {
  args: {
    label: "Country",
    placeholder: "Select a country",
  },
};

export const Hovered: Story = {
  args: {
    label: "Country",
    placeholder: "Select a country",
  },
  parameters: {
    pseudo: { hover: true },
  },
};

export const Focused: Story = {
  args: {
    label: "Country",
    placeholder: "Select a country",
  },
  parameters: {
    pseudo: { focus: true },
  },
};

export const Disabled: Story = {
  args: {
    label: "Disabled field",
    value: "FR",
    disabled: true,
  },
};

export const Required: Story = {
  args: {
    label: "Country",
    placeholder: "Select a country",
    required: true,
  },
};

export const WithSearchEnabled: Story = {
  args: {
    label: "Country",
    description: "Type to search through options",
    placeholder: "Select a country",
    enableSearch: true,
  },
};

export const WithError: Story = {
  args: {
    label: "Country",
    value: "AO",
    errors: ["Please select a different country"],
  },
};

export const WithWarning: Story = {
  args: {
    label: "Country",
    value: "AF",
    warnings: ["This country may have restricted access"],
  },
};

export const WithoutFlags: Story = {
  args: {
    label: "Country",
    description: "Shows country options without flag icons",
    placeholder: "Select a country",
    showFlagIcons: false,
  },
};

export const WithCodesOnly: Story = {
  args: {
    label: "Country",
    description: "Shows country codes only",
    placeholder: "Select a country",
    viewMode: "CodesOnly",
  },
};

export const WithNamesAndCodes: Story = {
  args: {
    label: "Country",
    description: "Shows country names and codes",
    placeholder: "Select a country",
    viewMode: "NamesAndCodes",
  },
};

export const WithDependentAreas: Story = {
  args: {
    label: "Country",
    description: "Shows dependent areas",
    placeholder: "Select a country",
    includeDependentAreas: true,
  },
};
