import { type Meta, type StoryObj } from "@storybook/react";
import { AnimatedLoader } from "./animated-loader";

const meta: Meta = {
  title: "Connect/Components/Animated Loader",
  component: AnimatedLoader,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = {
  args: {
    size: 50,
  },
};

export const Tiny: Story = {
  args: {
    size: 10,
  },
};
