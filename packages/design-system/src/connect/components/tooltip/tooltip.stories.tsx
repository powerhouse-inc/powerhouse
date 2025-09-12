import type { Meta, StoryObj } from "@storybook/react";
import { ConnectTooltip, ConnectTooltipProvider } from "./tooltip.js";

const meta: Meta<typeof ConnectTooltip> = {
  title: "Connect/Components/Tooltip",
  component: ConnectTooltip,
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
      <ConnectTooltipProvider>
        <ConnectTooltip {...args} content={tooltipContent}>
          <a id="tooltip">hover me</a>
        </ConnectTooltip>
      </ConnectTooltipProvider>
    );
  },
};
