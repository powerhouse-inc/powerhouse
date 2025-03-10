import { TooltipProvider } from "#connect";
import { type Meta, type StoryObj } from "@storybook/react";
import { Operation } from "./operation";

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
    <TooltipProvider>
      <Operation {...props} />,
    </TooltipProvider>
  ),
};
