import type { Meta, StoryObj } from "@storybook/react";
import { withForm } from "@/scalars/lib/decorators";
import { PHIDField } from "./phid-field";
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
    ...PrebuiltArgTypes.minLength,
    ...PrebuiltArgTypes.maxLength,

    defaultBranch: {
      control: "text",
      description: "defaultBranch",
      table: {
        type: { summary: "string" },
        defaultValue: { summary: "main" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    defaultScope: {
      control: "text",
      description: "defaultScope",
      table: {
        type: { summary: "string" },
        defaultValue: { summary: "public" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    allowedScopes: {
      control: "object",
      description: "allowedScopes",
      table: {
        type: { summary: "string[]" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    allowedDocumentTypes: {
      control: "object",
      description: "allowedDocumentTypes",
      table: {
        type: { summary: "string[]" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    allowUris: {
      control: "boolean",
      description: "allowUris",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    autoComplete: {
      control: "boolean",
      description: "autoComplete",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "true" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    allowDataObjectReference: {
      control: "boolean",
      description: "allowDataObjectReference",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    variant: {
      control: "radio",
      options: ["withId", "withIdAndTitle", "withIdTitleAndDescription"],
      description: "variant",
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
  },
};
