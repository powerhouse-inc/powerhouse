import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
  withForm,
} from "#scalars";
import type { Meta, StoryObj } from "@storybook/react";
import { PHIDField } from "./phid-field.js";
import { fetchOptions, fetchSelectedOption, mockedOptions } from "./utils.js";

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
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    autoComplete: {
      control: "boolean",
      description:
        "Enables autocomplete functionality to suggest PHIDs while typing",
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
        "Can return an array of PHIDItem with:\n\n" +
        "icon?: IconName | React.ReactElement\n\n" +
        "title?: string\n\n" +
        "path?: string\n\n" +
        "phid: string\n\n" +
        "description?: string",
      table: {
        type: { summary: "(phidFragment: string) => Promise<PHIDItem[]>" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
        readonly: true,
      },
      if: { arg: "autoComplete", neq: false },
    },

    fetchSelectedOptionCallback: {
      control: "object",
      description:
        "Function to fetch details for a selected PHID. " +
        "Can return a PHIDItem with:\n\n" +
        "icon?: IconName | React.ReactElement\n\n" +
        "title?: string\n\n" +
        "path?: string\n\n" +
        "phid: string\n\n" +
        "description?: string\n\n" +
        "or undefined if the PHID is not found",
      table: {
        type: { summary: "(phid: string) => Promise<PHIDItem | undefined>" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
        readonly: true,
      },
      if: { arg: "autoComplete", neq: false },
    },

    allowDataObjectReference: {
      control: "boolean",
      description: "Allows direct referencing of data objects in the field",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    variant: {
      control: "radio",
      options: ["withId", "withIdAndTitle", "withIdTitleAndDescription"],
      description:
        "Controls the amount of information displayed for each PHID: ID only, ID with title, or ID with title and description",
      table: {
        type: {
          summary: '"withId" | "withIdAndTitle" | "withIdTitleAndDescription"',
        },
        defaultValue: { summary: "withId" },
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
    variant: "withIdTitleAndDescription",
    isOpenByDefault: true,
    defaultValue: "phd:",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};

export const Open: Story = {
  args: {
    label: "PHID field",
    placeholder: "phd:",
    variant: "withIdTitleAndDescription",
    isOpenByDefault: true,
    defaultValue: "phd:",
    initialOptions: mockedOptions,
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};

export const Filled: Story = {
  args: {
    label: "PHID field",
    placeholder: "phd:",
    variant: "withIdTitleAndDescription",
    defaultValue: mockedOptions[0].phid,
    initialOptions: mockedOptions,
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};
