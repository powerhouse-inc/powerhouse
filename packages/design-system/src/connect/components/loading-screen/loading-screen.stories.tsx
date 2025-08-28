import type { Meta, StoryObj } from "@storybook/react";
import { LoadingScreen } from "./loading-screen.js";

const meta: Meta = {
  title: "Connect/Components/LoadingScreen",
  component: LoadingScreen,
  argTypes: {
    size: { control: { type: "number" } },
    showLoadingScreen: { control: { type: "boolean" } },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    showLoadingScreen: true,
  },
};

export const Small: Story = {
  args: {
    showLoadingScreen: true,
    size: 50,
  },
};

export const Tiny: Story = {
  args: {
    showLoadingScreen: true,
    size: 10,
  },
};
