import type { Meta, StoryObj } from "@storybook/react";
import { withForm } from "@/scalars/lib/decorators";
import { AutocompleteField } from "./autocomplete-field";
import { mockedOptions, fetchOptions, fetchSelectedOption } from "./utils";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
} from "@/scalars/lib/storybook-arg-types";

const meta: Meta<typeof AutocompleteField> = {
  title: "Document Engineering/Fragments/Autocomplete Field",
  component: AutocompleteField,
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
    ...PrebuiltArgTypes.maxLength,

    autoComplete: {
      control: "boolean",
      description:
        "Enables autocomplete functionality to suggest options while typing",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "true" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    fetchOptionsCallback: {
      control: "object",
      description:
        "Function to fetch options based on user input. " +
        "Must return an array of objects with the following properties:\n\n" +
        "icon?: IconName | React.ReactElement\n\n" +
        "title?: string\n\n" +
        "path?: string\n\n" +
        "value: string\n\n" +
        "description?: string\n\n",
      table: {
        type: {
          summary: "(userInput: string) => Promise<AutocompleteOption[]>",
        },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
        readonly: true,
      },
      if: { arg: "autoComplete", neq: false },
    },

    fetchSelectedOptionCallback: {
      control: "object",
      description:
        "Function to fetch details for a selected option. " +
        "Must return an object with the following properties:\n\n" +
        "icon?: IconName | React.ReactElement\n\n" +
        "title?: string\n\n" +
        "path?: string\n\n" +
        "value: string\n\n" +
        "description?: string\n\n" +
        "or undefined if the option is not found",
      table: {
        type: {
          summary: "(value: string) => Promise<AutocompleteOption | undefined>",
        },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
        readonly: true,
      },
      if: { arg: "autoComplete", neq: false },
    },

    variant: {
      control: "radio",
      options: ["withIdTitleAndDescription", "withIdAndTitle", "withId"],
      description:
        "Controls the amount of information displayed for each option: Id with title and description, Id with title, or Id only",
      table: {
        type: {
          summary: '"withIdTitleAndDescription" | "withIdAndTitle" | "withId"',
        },
        defaultValue: { summary: "withIdTitleAndDescription" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
      if: { arg: "autoComplete", neq: false },
    },

    renderOption: {
      control: "object",
      description:
        "Custom render function for autocomplete options. " +
        "Receives the option object and an optional displayProps object with the following properties:\n\n" +
        "asPlaceholder?: boolean\n\n" +
        "showValue?: boolean\n\n" +
        "isLoadingSelectedOption?: boolean\n\n" +
        "handleFetchSelectedOption?: (value: string) => void\n\n" +
        "className?: string\n\n" +
        "Must return a ReactNode.",
      table: {
        type: {
          summary:
            "(option: AutocompleteOption, displayProps?: {\n" +
            "  asPlaceholder?: boolean,\n" +
            "  showValue?: boolean,\n" +
            "  isLoadingSelectedOption?: boolean,\n" +
            "  handleFetchSelectedOption?: (value: string) => void,\n" +
            "  className?: string\n" +
            "}) => React.ReactNode",
        },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
        readonly: true,
      },
      if: { arg: "autoComplete", neq: false },
    },

    ...getValidationArgTypes(),
  },
  args: {
    name: "autocomplete-field",
  },
} satisfies Meta<typeof AutocompleteField>;

export default meta;

type Story = StoryObj<typeof AutocompleteField>;

export const Default: Story = {
  args: {
    label: "Autocomplete field",
    placeholder: "Search...",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};

export const Empty: Story = {
  args: {
    label: "Autocomplete field",
    placeholder: "Search...",
    isOpenByDefault: true,
    defaultValue: "with no matching options",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};

export const Open: Story = {
  args: {
    label: "Autocomplete field",
    placeholder: "Search...",
    isOpenByDefault: true,
    defaultValue: "with matching options",
    initialOptions: mockedOptions,
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};

export const Filled: Story = {
  args: {
    label: "Autocomplete field",
    placeholder: "Search...",
    defaultValue: mockedOptions[0].value,
    initialOptions: mockedOptions,
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};
