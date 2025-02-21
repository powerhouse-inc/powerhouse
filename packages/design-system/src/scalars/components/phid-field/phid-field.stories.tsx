import type { Meta, StoryObj } from "@storybook/react";
import { withForm } from "@/scalars/lib/decorators";
import { PHIDField } from "./phid-field";
import { mockedOptions, fetchOptions, fetchSelectedOption } from "./utils";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
} from "@/scalars/lib/storybook-arg-types";

const meta: Meta<typeof PHIDField> = {
  title: "Document Engineering/Simple Components/PHID Field",
  component: PHIDField,
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

    allowedScopes: {
      control: "object",
      description: "List of allowed scopes.",
      table: {
        type: { summary: "string[]" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    allowUris: {
      control: "boolean",
      description: "Enables URI format as valid input in the field",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "true" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

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
          summary: "(userInput: string) => Promise<IdAutocompleteOption[]>",
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
          summary:
            "(value: string) => Promise<IdAutocompleteOption | undefined>",
        },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
        readonly: true,
      },
      if: { arg: "autoComplete", neq: false },
    },

    variant: {
      control: "radio",
      options: [
        "withValue",
        "withValueAndTitle",
        "withValueTitleAndDescription",
      ],
      description:
        "Controls the amount of information displayed for each option: value only, value with title, or value with title and description",
      table: {
        type: {
          summary:
            '"withValue" | "withValueAndTitle" | "withValueTitleAndDescription"',
        },
        defaultValue: { summary: "withValue" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
      if: { arg: "autoComplete", neq: false },
    },

    ...getValidationArgTypes(),
  },
  args: {
    name: "phid-field",
  },
} satisfies Meta<typeof PHIDField>;

export default meta;

type Story = StoryObj<typeof PHIDField>;

export const Default: Story = {
  args: {
    label: "PHID field",
    placeholder: "phd:",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};

export const Empty: Story = {
  args: {
    label: "PHID field",
    placeholder: "phd:",
    isOpenByDefault: true,
    defaultValue: "phd:",
    variant: "withValueTitleAndDescription",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};

export const Open: Story = {
  args: {
    label: "PHID field",
    placeholder: "phd:",
    isOpenByDefault: true,
    defaultValue: "phd:",
    variant: "withValueTitleAndDescription",
    initialOptions: mockedOptions,
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};

export const Filled: Story = {
  args: {
    label: "PHID field",
    placeholder: "phd:",
    defaultValue: mockedOptions[0].value,
    initialOptions: mockedOptions,
    variant: "withValueTitleAndDescription",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};
