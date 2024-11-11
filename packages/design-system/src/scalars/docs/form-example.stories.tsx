import type { Meta, StoryObj } from "@storybook/react";
import FormExample from "./form-example";

const meta = {
  title: "Document Engineering/Docs/FormExample",
  component: FormExample,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof FormExample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
