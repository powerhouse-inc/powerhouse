import type { Meta, StoryObj } from "@storybook/react";
import {
  fetchOptions,
  fetchSelectedOption,
  mockedOptions,
} from "../../../ui/components/data-entry/oid-input/mocks.js";
import { withForm } from "../../lib/decorators.js";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
} from "../../lib/storybook-arg-types.js";
import { OIDField } from "./oid-field.js";

const meta: Meta<typeof OIDField> = {
  title: "Document Engineering/Scalars/OID Field",
  component: OIDField,
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
        "Function to fetch options based on user input and context. " +
        "Must return a Promise that resolves to an array of objects or an array of objects with the following properties:\n\n" +
        "icon?: IconName | React.ReactElement\n\n" +
        "title?: string\n\n" +
        "path?: string | { text: string; url: string; }\n\n" +
        "value: string\n\n" +
        "description?: string\n\n",
      table: {
        type: {
          summary:
            "(userInput: string; context?: {}) => Promise<OIDOption[]> | OIDOption[]",
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
        "Must return a Promise that resolves to an object or an object with the following properties:\n\n" +
        "icon?: IconName | React.ReactElement\n\n" +
        "title?: string\n\n" +
        "path?: string | { text: string; url: string; }\n\n" +
        "value: string\n\n" +
        "description?: string\n\n" +
        "or undefined if the option is not found",
      table: {
        type: {
          summary:
            "(value: string) => Promise<OIDOption | undefined> | OIDOption | undefined",
        },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
        readonly: true,
      },
      if: { arg: "autoComplete", neq: false },
    },

    previewPlaceholder: {
      control: "object",
      description:
        "Custom placeholder values to show when no option is selected or when there are no matching options. " +
        "Can include custom values for:\n\n" +
        "icon?: IconName | React.ReactElement\n\n" +
        "title?: string\n\n" +
        "path?: string | { text: string; url: string; }\n\n" +
        "value: string\n\n" +
        "description?: string\n\n",
      table: {
        type: { summary: "OIDOption" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
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
    name: "oid-field",
  },
} satisfies Meta<typeof OIDField>;

export default meta;

type Story = StoryObj<typeof OIDField>;

export const Default: Story = {
  args: {
    label: "OID field",
    placeholder: "uuid",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};

export const Empty: Story = {
  args: {
    label: "OID field",
    placeholder: "uuid",
    isOpenByDefault: true,
    defaultValue: "uuid",
    variant: "withValueTitleAndDescription",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};

export const Open: Story = {
  args: {
    label: "OID field",
    placeholder: "uuid",
    isOpenByDefault: true,
    defaultValue: "uuid",
    variant: "withValueTitleAndDescription",
    initialOptions: mockedOptions,
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};

export const Filled: Story = {
  args: {
    label: "OID field",
    placeholder: "uuid",
    defaultValue: mockedOptions[0].value,
    initialOptions: mockedOptions,
    variant: "withValueTitleAndDescription",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};
