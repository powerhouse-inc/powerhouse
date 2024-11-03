import type { Meta, StoryObj } from "@storybook/react";
import TestingForm from "./testing-form";

const meta = {
  title: "Document Engineering/TestingForm",
  component: TestingForm,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof TestingForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
