import type { Meta, StoryObj } from "@storybook/react";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
} from "../../../../scalars/lib/storybook-arg-types.js";
import { fetchOptions, fetchSelectedOption, mockedOptions } from "./mocks.js";
import { OIDInput } from "./oid-input.js";

/**
 * The `OIDInput` component provides an input field for Object IDs (typically UUIDs).
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
 * > you can use the [OIDField](?path=/docs/document-engineering-scalars-oid-field--readme)
 * > component.
 */

const meta: Meta<typeof OIDInput> = {
  title: "Document Engineering/Data Entry/OID Input",
  component: OIDInput,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "280px", margin: "0 auto" }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "centered",
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
  },
} satisfies Meta<typeof OIDInput>;

export default meta;

type Story = StoryObj<typeof OIDInput>;

export const Default: Story = {
  args: {
    label: "OID input",
    placeholder: "uuid",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};

export const Empty: Story = {
  args: {
    label: "OID input",
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
    label: "OID input",
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
    label: "OID input",
    placeholder: "uuid",
    defaultValue: mockedOptions[0].value,
    initialOptions: mockedOptions,
    variant: "withValueTitleAndDescription",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};
