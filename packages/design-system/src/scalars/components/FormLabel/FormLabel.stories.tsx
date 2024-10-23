import type { Meta, StoryObj } from "@storybook/react";
import { FormLabel } from "./FormLabel";

const meta: Meta<typeof FormLabel> = {
  title: "Document Engineering/Simple Components/FormLabel",
  component: FormLabel,
  argTypes: {
    required: {
      control: {
        type: "boolean",
      },
    },
    description: {
      control: {
        type: "text",
      },
    },
    hasError: {
      control: {
        type: "boolean",
      },
    },
    disabled: {
      control: {
        type: "boolean",
      },
    },
    className: {
      control: {
        type: "text",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: "Hello, World!",
  },
};
