import type { Meta, StoryObj } from "@storybook/react";
import { Tooltip, TooltipProvider } from "./tooltip.js";

const meta: Meta<typeof Tooltip> = {
  title: "Connect/Components/Tooltip",
  component: Tooltip,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Wrapper(args) {
    const tooltipContent = (
      <div>
        <div>tooltip content</div>
        <button onClick={() => alert("you can click me")}>click me</button>
      </div>
    );
    return (
      <TooltipProvider>
        <Tooltip {...args} content={tooltipContent}>
          <a id="tooltip">hover me</a>
        </Tooltip>
      </TooltipProvider>
    );
  },
};
