import type { Meta, StoryObj } from "@storybook/react";
import { LogoAnimation } from "./logo-animation.js";

const meta: Meta<typeof LogoAnimation> = {
  title: "Connect/Components/Logo Animation",
  component: LogoAnimation,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    (Story) => (
      <div className="">
        <Story />
      </div>
    ),
  ],
};
