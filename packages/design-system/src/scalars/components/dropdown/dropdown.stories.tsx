import type { Meta, StoryObj } from "@storybook/react";
import DropdownExample from "./dropdown";
import { StorybookControlCategory } from "@/scalars/lib/storybook-arg-types";

const meta: Meta<typeof DropdownExample> = {
  title: "Document Engineering/Simple Components/Dropdown",
  component: DropdownExample,
  parameters: {
    layout: "centered",
    chromatic: {
      disableSnapshot: true,
    },
  },
  tags: ["autodocs"],

  argTypes: {
    label: {
      label: {
        control: "text",
        description: "Sets the visible label text for the input field",
        table: {
          type: { summary: "string" },
          category: StorybookControlCategory.COMPONENT_SPECIFIC,
        },
      },
    },
  },
} satisfies Meta<typeof DropdownExample>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  args: {
    label: "Export as",
  },
};
