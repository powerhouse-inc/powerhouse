import type { Meta, StoryObj } from "@storybook/react";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
} from "../../../../scalars/lib/storybook-arg-types.js";
import { AIDInput } from "./aid-input.js";
import { fetchOptions, fetchSelectedOption, mockedOptions } from "./mocks.js";

/**
 * The `AIDInput` component provides an input field for Agent IDs (typically DIDs).
 * It supports multiple configuration properties like:
 * - label
 * - description
 * - autoComplete
 * - fetchOptionsCallback
 * - fetchSelectedOptionCallback
 * - previewPlaceholder
 * - variant
 *
 * Features include:
 * - Multiple display variants for autocomplete options
 * - Copy paste support
 * - Async and sync options fetching
 *
 * > **Note:** This component does not have built-in validation. If you need built-in validation
 * > you can use the [AIDField](?path=/docs/document-engineering-scalars-aid-field--readme)
 * > component.
 */

const meta: Meta<typeof AIDInput> = {
  title: "Document Engineering/Data Entry/AID Input",
  component: AIDInput,
  decorators: [
    (Story) => (
      <div style={{ width: "280px", margin: "1rem auto 0" }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "padded",
    chromatic: {
      disableSnapshot: true,
    },
  },
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes(),
    ...getValidationArgTypes({
      enabledArgTypes: {
        validators: false,
        showErrorOnBlur: false,
        showErrorOnChange: false,
      },
    }),
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
  },
  args: {
    name: "aid-input",
  },
} satisfies Meta<typeof AIDInput>;

export default meta;

type Story = StoryObj<typeof AIDInput>;

export const Default: Story = {
  args: {
    label: "AID input",
    placeholder: "did:ethr:",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};

export const Empty: Story = {
  args: {
    label: "AID input",
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
    label: "AID input",
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
    label: "AID input",
    placeholder: "did:ethr:",
    defaultValue: mockedOptions[0].value,
    initialOptions: mockedOptions,
    variant: "withValueTitleAndDescription",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};
