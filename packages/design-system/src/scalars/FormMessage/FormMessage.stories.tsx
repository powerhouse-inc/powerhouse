import type { Meta, StoryObj } from "@storybook/react";
import { FormMessage } from "./FormMessage";

const meta: Meta<typeof FormMessage> = {
  title: "Scalars/Components/FormMessage",
  component: FormMessage,
  argTypes: {
    type: {
      control: {
        type: "select",
      },
      options: ["error", "info", "warning"],
    },
    children: {
      control: {
        type: "text",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {
  args: {
    children: "Your changes will be automatically saved as you type",
    type: "info",
  },
};

export const Warning: Story = {
  args: {
    children: "Please correct the errors before submitting",
    type: "warning",
  },
};

export const Error: Story = {
  args: {
    children: "Please correct the errors before submitting",
    type: "error",
  },
};
