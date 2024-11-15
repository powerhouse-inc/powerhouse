import type { Meta, StoryObj } from "@storybook/react";
import { withForm } from "@/scalars/lib/decorators";
import { AmountField } from "./amount-field";

const meta = {
  title: "Document Engineering/Complex Components/AmountField",
  component: AmountField,
  decorators: [withForm],
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    name: {
      control: "text",
      description: "Name attribute for the input field",
    },
    label: {
      control: "text",
      description: "Label text displayed above the input field",
    },
    type: {
      control: "select",
      options: [
        "Amount",
        "AmountCurrency",
        "AmountToken",
        "AmountToken",
        "AmountPercentage",
      ],
      description: "Amount type",
    },
  },
  args: {
    errors: [],
    warnings: [],
    name: "amount-field",
  },
} satisfies Meta<typeof AmountField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Enter ",
    name: "amount",
    type: "AmountPercentage",
    value: {
      amount: 300,
    },
  },
};
