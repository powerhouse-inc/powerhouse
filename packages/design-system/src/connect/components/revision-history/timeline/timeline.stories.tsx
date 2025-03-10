import { type Meta, type StoryObj } from "@storybook/react";
import { TooltipProvider } from "../../tooltip";
import { globalOperations, localOperations } from "../mocks";
import { Timeline } from "./timeline";

const meta = {
  title: "Connect/Components/Revision History/Timeline",
  component: Timeline,
} satisfies Meta<typeof Timeline>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    globalOperations,
    localOperations,
    scope: "global",
  },
  render(args) {
    return (
      <TooltipProvider>
        <Timeline {...args} />
      </TooltipProvider>
    );
  },
};
