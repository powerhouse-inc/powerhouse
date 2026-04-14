import type { Meta, StoryObj } from "@storybook/react";
import { ConnectTooltipProvider } from "../../tooltip/tooltip.js";
import { Operation } from "./operation.js";

const meta = {
  title: "Connect/Components/Revision History/Revision/Operation",
  component: Operation,
} satisfies Meta<typeof Operation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    operationType: "APPROVE_BUDGET",
    operationInput: {
      id: "eByxUvWzZtNOPbdH8JZIZI/beoO-",
      reference: "OC303687",
      label: "Account 1",
      nested: {
        example: "nested",
      },
    },
  },
  render: (props) => (
    <ConnectTooltipProvider>
      <Operation {...props} />,
    </ConnectTooltipProvider>
  ),
};

export const LongValues: Story = {
  args: {
    operationType: "SCHEDULE_PAYMENT",
    operationInput: {
      id: "9329f23a-e0d6-4682-abdd-6777abf2f15d",
      paymentDate: "2026-04-14T17:00:26.452Z",
      processorRef:
        "0x1FB6bEF04230d67aF0e3455B997a28AFcCe1F45e:0xf7c616f60bcb8b00fd9fe948894d57bb6c2232fa42156509db2b08e5d28bba43",
    },
  },
  render: (props) => (
    <div className="p-32">
      <ConnectTooltipProvider>
        <Operation {...props} />
      </ConnectTooltipProvider>
    </div>
  ),
};
