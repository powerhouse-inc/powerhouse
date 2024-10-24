import type { Meta, StoryObj } from "@storybook/react";
import { ScalarDemo } from "./scalar-demo";

const meta: Meta<typeof ScalarDemo> = {
  title: "Document Engineering/Complex Components/ScalarDemo",
  component: ScalarDemo,
  argTypes: {
    name: {
      control: {
        type: "text",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    name: "Hello, World!",
  },
};
