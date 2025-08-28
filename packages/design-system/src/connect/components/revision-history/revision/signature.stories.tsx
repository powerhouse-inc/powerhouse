import { TooltipProvider } from "@powerhousedao/design-system";
import type { Meta, StoryObj } from "@storybook/react";
import { Signature } from "./signature.js";

const meta = {
  title: "Connect/Components/Revision History/Revision/Signature",
  component: Signature,
} satisfies Meta<typeof Signature>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NotVerified: Story = {
  args: {
    signatures: [
      {
        signerAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        hash: "wH041NamJQq3AHgk8tD/suXDDI=",
        prevStateHash: "wH041NamJQq3AHgk8tD/suXDDI=",
        signatureBytes: "0x1234",
        isVerified: false,
      },
      {
        signerAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        hash: "wH041NamJQq3AHgk8tD/suXDDI=",
        prevStateHash: "wH041NamJQq3AHgk8tD/suXDDI=",
        signatureBytes: "0x1234",
        isVerified: false,
      },
    ],
  },
  render: (props) => (
    <TooltipProvider>
      <Signature {...props} />
    </TooltipProvider>
  ),
};

export const PartiallyVerified: Story = {
  args: {
    signatures: [
      {
        signerAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        hash: "wH041NamJQq3AHgk8tD/suXDDI=",
        prevStateHash: "wH041NamJQq3AHgk8tD/suXDDI=",
        signatureBytes: "0x1234",
        isVerified: true,
      },
      {
        signerAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        hash: "wH041NamJQq3AHgk8tD/suXDDI=",
        prevStateHash: "wH041NamJQq3AHgk8tD/suXDDI=",
        signatureBytes: "0x1234",
        isVerified: false,
      },
    ],
  },
  render: (props) => (
    <TooltipProvider>
      <Signature {...props} />
    </TooltipProvider>
  ),
};

export const Verified: Story = {
  args: {
    signatures: [
      {
        signerAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        hash: "wH041NamJQq3AHgk8tD/suXDDI=",
        prevStateHash: "wH041NamJQq3AHgk8tD/suXDDI=",
        signatureBytes: "0x1234",
        isVerified: true,
      },
      {
        signerAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        hash: "wH041NamJQq3AHgk8tD/suXDDI=",
        prevStateHash: "wH041NamJQq3AHgk8tD/suXDDI=",
        signatureBytes: "0x1234",
        isVerified: true,
      },
    ],
  },
  render: (props) => (
    <TooltipProvider>
      <Signature {...props} />
    </TooltipProvider>
  ),
};
