import type { Meta, StoryObj } from "@storybook/react";
import { ScalarDemo } from "./ScalarDemo";

const meta: Meta<typeof ScalarDemo> = {
  title: "COMPLEX COMPONENTS/Components/ScalarDemo",
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
