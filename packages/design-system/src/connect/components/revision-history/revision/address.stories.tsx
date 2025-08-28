import { TooltipProvider } from "@powerhousedao/design-system";
import type { Meta, StoryObj } from "@storybook/react";
import { Address } from "./address.js";

const meta = {
  title: "Connect/Components/Revision History/Revision/Address",
  component: Address,
} satisfies Meta<typeof Address>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    chainId: 1,
  },
  render: (props) => (
    <TooltipProvider>
      <Address {...props} />
    </TooltipProvider>
  ),
};
