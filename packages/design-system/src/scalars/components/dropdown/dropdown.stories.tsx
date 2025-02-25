import type { Meta, StoryObj } from "@storybook/react";
import DropdownExample from "./dropdown";

const meta: Meta<typeof DropdownExample> = {
  title: "Document Engineering/Simple Components/Dropdown Example",
  component: DropdownExample,
  parameters: {
    layout: "centered",
    chromatic: {
      disableSnapshot: true,
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof DropdownExample>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  args: {
    label: "Export as",
  },
};
