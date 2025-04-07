import type { Meta, StoryObj } from "@storybook/react";
import {
  fetchOptions,
  fetchSelectedOption,
  mockedOptions,
} from "../../../ui/components/data-entry/aid-input/mocks.js";
import { withForm } from "../../lib/decorators.js";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
} from "../../lib/storybook-arg-types.js";
import { AIDField } from "./aid-field.js";

const meta: Meta<typeof AIDField> = {
  title: "Document Engineering/Scalars/AID Field",
  component: AIDField,
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

    supportedNetworks: {
      control: "object",
      description:
        "List of supported networks for DID validation. Network interface: { chainId: string; name?: string; }",
      table: {
        type: { summary: "Network[]" },
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
        "Function to fetch options based on user input and context. " +
        "Must return a Promise that resolves to an array of objects or an array of objects with the following properties:\n\n" +
        "icon?: IconName | React.ReactElement\n\n" +
        "title?: string\n\n" +
        "path?: string | { text: string; url: string; }\n\n" +
        "value: string\n\n" +
        "description?: string\n\n" +
        "agentType?: string\n\n",
      table: {
        type: {
          summary:
            "(userInput: string; context?: { supportedNetworks?: Network[]; }) => Promise<AIDOption[]> | AIDOption[]",
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
        "agentType?: string\n\n" +
        "or undefined if the option is not found",
      table: {
        type: {
          summary:
            "(value: string) => Promise<AIDOption | undefined> | AIDOption | undefined",
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
        "description?: string\n\n" +
        "agentType?: string\n\n",
      table: {
        type: { summary: "AIDOption" },
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
    name: "aid-field",
  },
} satisfies Meta<typeof AIDField>;

export default meta;

type Story = StoryObj<typeof AIDField>;

export const Default: Story = {
  args: {
    label: "AID field",
    placeholder: "did:ethr:",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};

export const Empty: Story = {
  args: {
    label: "AID field",
    placeholder: "did:ethr:",
    isOpenByDefault: true,
    defaultValue: "did:ethr:",
    variant: "withValueTitleAndDescription",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};

export const Open: Story = {
  args: {
    label: "AID field",
    placeholder: "did:ethr:",
    isOpenByDefault: true,
    defaultValue: "did:ethr:",
    variant: "withValueTitleAndDescription",
    initialOptions: mockedOptions,
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};

export const Filled: Story = {
  args: {
    label: "AID field",
    placeholder: "did:ethr:",
    defaultValue: mockedOptions[0].value,
    initialOptions: mockedOptions,
    variant: "withValueTitleAndDescription",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};
