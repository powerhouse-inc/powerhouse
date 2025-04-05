import { type Meta, type StoryObj } from "@storybook/react";
import { ENSAvatar } from "./ens-avatar.js";

const meta = {
  title: "Connect/Components/ENSAvatar",
  component: ENSAvatar,
} satisfies Meta<typeof ENSAvatar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithoutValidAvatar: Story = {
  args: {
    address: "0x1234567890123456789012345678901234567890",
    chainId: 1,
  },
};

export const WithValidAvatar: Story = {
  args: {
    address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    chainId: 1,
  },
};
