import { type Meta, type StoryObj } from "@storybook/react";
import { TooltipProvider } from "../../tooltip/index.js";
import { RevisionNumber } from "./revision-number.js";

const meta = {
  title: "Connect/Components/Revision History/Revision/Revision Number",
  component: RevisionNumber,
} satisfies Meta<typeof RevisionNumber>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    operationIndex: 0,
    eventId: "21",
    stateHash: "wH041NamJQq3AHgk8tD/suXDDI=",
  },
  render(args) {
    return (
      <TooltipProvider>
        <RevisionNumber {...args} />
      </TooltipProvider>
    );
  },
};
