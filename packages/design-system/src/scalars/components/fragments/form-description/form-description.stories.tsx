import type { Meta, StoryObj } from "@storybook/react";
import { FormDescription } from "./form-description";

const meta = {
  title: "Document Engineering/Fragments/FormDescription",
  component: FormDescription,
  parameters: {
    layout: "centered",
    chromatic: {
      disableSnapshot: true,
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof FormDescription>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: "This is a helpful description for the form field above.",
  },
};

export const CustomClassName: Story = {
  args: {
    className: "text-blue-600",
    children: "Description with custom styling",
  },
};
