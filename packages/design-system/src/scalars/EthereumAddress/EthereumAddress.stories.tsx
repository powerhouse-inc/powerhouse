import { type Meta, type StoryObj } from "@storybook/react";
import { EthereumAddress } from "./EthereumAddress.js";

const meta = {
  title: "Scalars/EthereumAddress",
  component: EthereumAddress,
  argTypes: {
    onChange: { action: "onChange" },
  },
} satisfies Meta<typeof EthereumAddress>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onChange: (address: string, isValidAddress: boolean) => {
      console.log({ address, isValidAddress });
    },
  },
};
