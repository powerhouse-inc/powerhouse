import { Meta, StoryObj } from "@storybook/react";
import MyForm from "./MyForm";

const meta: Meta<typeof MyForm> = {
  component: MyForm,
  title: "Document Engineering/Simple Components/MyForm",
  tags: ["autodocs"],
  argTypes: {
    checked: {
      control: {
        checked: "boolean",
      },
    },
    disabled: {
      control: {
        checked: "boolean",
      },
    },
    description: {
      control: {
        checked: "boolean",
      },
    },
    error: {
      control: "object",
      table: { defaultValue: { summary: "[]" } },
    },
  },
};

export default meta;

type Story = StoryObj<typeof MyForm>;

export const Default: Story = {
  args: {
    checked: false,
    disabled: false,
    error: [],
    label: "Default Checkbox",
  },
};
