import type { Meta, StoryObj } from "@storybook/react";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
} from "../../../../scalars/lib/storybook-arg-types.js";
import { fetchOptions, fetchSelectedOption, mockedOptions } from "./mocks.js";
import { PHIDInput } from "./phid-input.js";

/**
 * The `PHIDInput` component provides an input field for Powerhouse IDs.
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
 * > you can use the [PHIDField](?path=/docs/document-engineering-scalars-phid-field--readme)
 * > component.
 */

const meta: Meta<typeof PHIDInput> = {
  title: "Document Engineering/Data Entry/PHID Input",
  component: PHIDInput,
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

    allowUris: {
      control: "boolean",
      description: "Enables URI format as valid input in the field",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    allowedScopes: {
      control: "object",
      description: "List of allowed scopes.",
      table: {
        type: { summary: "string[]" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
      if: { arg: "allowUris", eq: true },
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
        "description?: string\n\n",
      table: {
        type: {
          summary:
            "(userInput: string; context?: { allowUris?: boolean; " +
            "allowedScopes?: string[]; }) => Promise<PHIDOption[]> | PHIDOption[]",
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
            "(value: string) => Promise<PHIDOption | undefined> | PHIDOption | undefined",
        },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
        readonly: true,
      },
      if: { arg: "autoComplete", neq: false },
    },

    initialOptions: {
      control: "object",
      description:
        "Array of options to initially populate the autocomplete dropdown",
      table: {
        type: { summary: "PHIDOption[]" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
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
        type: { summary: "PHIDOption" },
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

    ...PrebuiltArgTypes.viewMode,
    ...PrebuiltArgTypes.diffMode,
    ...PrebuiltArgTypes.baseValue,

    basePreviewTitle: {
      control: "text",
      description: "The title of the base preview",
      table: {
        category: StorybookControlCategory.DIFF,
      },
    },
    basePreviewPath: {
      control: "text",
      description: "The path of the base preview",
      table: {
        category: StorybookControlCategory.DIFF,
      },
    },
    basePreviewDescription: {
      control: "text",
      description: "The description of the base preview",
      table: {
        category: StorybookControlCategory.DIFF,
      },
    },
  },
  args: {
    name: "phid-input",
  },
} satisfies Meta<typeof PHIDInput>;

export default meta;

type Story = StoryObj<typeof PHIDInput>;

export const Default: Story = {
  args: {
    label: "PHID input",
    placeholder: "phd:",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};

export const Empty: Story = {
  args: {
    label: "PHID input",
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
    label: "PHID input",
    placeholder: "phd:",
    isOpenByDefault: true,
    defaultValue: "phd:",
    initialOptions: mockedOptions,
    allowUris: true,
    variant: "withValueTitleAndDescription",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};

export const Filled: Story = {
  args: {
    label: "PHID input",
    placeholder: "phd:",
    defaultValue: mockedOptions[0].value,
    initialOptions: mockedOptions,
    allowUris: true,
    variant: "withValueTitleAndDescription",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};
