import type { Meta, StoryObj } from "@storybook/react";
import { ConnectTooltipProvider } from "@powerhousedao/design-system";
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
      <ConnectTooltipProvider>
        <RevisionNumber {...args} />
      </ConnectTooltipProvider>
    );
  },
};
