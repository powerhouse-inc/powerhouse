import { type Meta, type StoryObj } from "@storybook/react";
import { Revision } from "./revision";
import { TooltipProvider } from "@/connect";

const meta = {
  title: "Connect/Components/Revision History/Revision",
  component: Revision,
} satisfies Meta<typeof Revision>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Verified: Story = {
  args: {
    operationIndex: 0,
    eventId: "123",
    type: "revision",
    height: 46,
    stateHash: "wH041NamJQq3AHgk8tD/suXDDI=",
    operationType: "APPROVE_BUDGET",
    operationInput: {
      id: "eByxUvWzZtNOPbdH8JZIZI/beoO-",
      reference: "OC303687",
      label: "Account 1",
      nested: {
        example: "nested",
      },
    },
    address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    chainId: 1,
    timestamp: "1719232415114",
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
    errors: [],
  },
  render: (props) => (
    <TooltipProvider>
      <Revision {...props} />
    </TooltipProvider>
  ),
};

export const PartiallyVerified: Story = {
  args: {
    operationIndex: 0,
    eventId: "123",
    type: "revision",
    height: 46,
    stateHash: "wH041NamJQq3AHgk8tD/suXDDI=",
    operationType: "APPROVE_BUDGET",
    operationInput: {
      id: "eByxUvWzZtNOPbdH8JZIZI/beoO-",
      reference: "OC303687",
      label: "Account 1",
      nested: {
        example: "nested",
      },
    },
    address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    chainId: 1,
    timestamp: "1719232415114",
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
    errors: ["Data mismatch detected"],
  },
  render: (props) => (
    <TooltipProvider>
      <Revision {...props} />
    </TooltipProvider>
  ),
};

export const NotVerified: Story = {
  args: {
    operationIndex: 0,
    eventId: "123",
    type: "revision",
    height: 46,
    stateHash: "wH041NamJQq3AHgk8tD/suXDDI=",
    operationType: "APPROVE_BUDGET",
    operationInput: {
      id: "eByxUvWzZtNOPbdH8JZIZI/beoO-",
      reference: "OC303687",
      label: "Account 1",
      nested: {
        example: "nested",
      },
    },
    address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    chainId: 1,
    timestamp: "1719232415114",
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
    errors: ["Data mismatch detected"],
  },
  render: (props) => (
    <TooltipProvider>
      <Revision {...props} />
    </TooltipProvider>
  ),
};
