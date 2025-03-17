import type { Meta, StoryObj } from "@storybook/react";
import { withForm } from "../../lib/decorators.js";
import { IdField } from "./id-field.js";

const meta = {
  title: "Document Engineering/Simple Components/IdField",
  component: IdField,
  decorators: [withForm],
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  argTypes: {
    name: {
      control: false,
      description: "Name of the field in the form data",
      table: {
        type: { summary: "string" },
        defaultValue: { summary: "id" },
        category: "Default",
      },
    },
    value: {
      control: false,
      description:
        "A predefined value for the ID field. If provided, this value will be used instead of generating a new ID.",
      table: {
        type: { summary: "string" },
        defaultValue: { summary: "auto-generated" },
        category: "Default",
      },
    },
    generator: {
      control: false,
      description:
        "Generator function or built-in generator to generate the ID.",
      table: {
        type: { summary: "UUID | (() => string)" },
        defaultValue: { summary: "UUID" },
        category: "Default",
      },
    },
  },
} satisfies Meta<typeof IdField>;

export default meta;
type Story = StoryObj<typeof IdField>;

export const Default: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-gray-500">
        <p>This form contains a hidden IdField that will generate a UUID.</p>
        <p>Submit the form to see the generated ID in the alert.</p>
      </div>

      <IdField />
      <button type="submit">Submit to see ID</button>
    </div>
  ),
  parameters: {
    docs: {
      source: {
        code: `<IdField />`,
      },
    },
  },
};

export const CustomGenerator: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-gray-500">
        <p>This form contains a hidden IdField with a custom ID generator.</p>
        <p>Submit the form to see the generated ID in the alert.</p>
      </div>

      <IdField generator={() => `custom-${Date.now()}`} />
      <button type="submit">Submit to see ID</button>
    </div>
  ),
  parameters: {
    docs: {
      source: {
        code: `<IdField generator={() => \`custom-\${Date.now()}\`} />`,
      },
    },
  },
};

export const CustomIdValue: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-gray-500">
        <p>This form contains a hidden IdField with the id: "custom-id".</p>
        <p>Submit the form to see the ID in the alert.</p>
      </div>

      <IdField value="custom-id" />
      <button type="submit">Submit to see ID</button>
    </div>
  ),
  parameters: {
    docs: {
      source: {
        code: `<IdField value="custom-id" />`,
      },
    },
  },
};
