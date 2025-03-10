import type { Meta, StoryObj } from "@storybook/react";
import { Tooltip, TooltipProvider } from "./tooltip.js";

const meta: Meta<typeof Tooltip> = {
  title: "Document Engineering/Fragments/Tooltip",
  component: Tooltip,
  parameters: {
    layout: "centered",
    chromatic: {
      disableSnapshot: true,
    },
    docs: {
      description: {
        component: `A tooltip is a popup that displays informative text when users hover over an element.
        Tooltips must be wrapped in a TooltipProvider component to function properly. The provider is
        responsible for managing tooltip state and positioning.`,
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
  argTypes: {
    content: {
      description: "The content to display in the tooltip",
      control: "text",
    },
    children: {
      description: "The trigger element for the tooltip",
      control: false,
    },
    defaultOpen: {
      description: "The initial open state of the tooltip",
      control: "boolean",
    },
    open: {
      description: "Controlled open state of the tooltip",
      control: "boolean",
    },
    onOpenChange: {
      description: "Event handler called when the open state changes",
      control: false,
    },
    className: {
      description:
        "Additional CSS/Tailwind classes to apply to the tooltip content",
      control: "text",
    },
    align: {
      description: "The alignment of the tooltip content",
      control: "select",
      options: ["center", "start", "end"],
    },
    side: {
      description: "The side of the trigger that the tooltip should align to",
      control: "select",
      options: ["top", "right", "bottom", "left"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    content: "This is a tooltip",
    children: <button>Hover me</button>,
  },
};

export const CustomStyle: Story = {
  args: {
    content: "Custom styled tooltip",
    children: <button>Hover for custom tooltip</button>,
    className: "bg-blue-500 text-white dark:bg-blue-600 dark:text-white",
  },
};

export const DefaultOpen: Story = {
  args: {
    content: "This tooltip starts open",
    children: <button>Already showing tooltip</button>,
    defaultOpen: true,
  },
};

export const Alignments: Story = {
  render: () => (
    <div>
      <div className="mb-8 text-center text-lg font-medium">
        Tooltip alignments
      </div>
      <div className="flex items-center justify-center gap-32">
        <Tooltip content="Start aligned" align="start">
          <button>Start</button>
        </Tooltip>
        <Tooltip content="Center aligned" align="center">
          <button>Center</button>
        </Tooltip>
        <Tooltip content="End aligned" align="end">
          <button>End</button>
        </Tooltip>
      </div>
    </div>
  ),
};

export const DifferentSides: Story = {
  render: () => (
    <div>
      <div className="mb-8 text-center text-lg font-medium">
        Tooltip side positions
      </div>
      <div className="flex items-center justify-center gap-32">
        <Tooltip content="Above" side="top">
          <button>Top</button>
        </Tooltip>
        <Tooltip content="Right side" side="right">
          <button>Right</button>
        </Tooltip>
        <Tooltip content="Below" side="bottom">
          <button>Bottom</button>
        </Tooltip>
        <Tooltip content="Left side" side="left">
          <button>Left</button>
        </Tooltip>
      </div>
    </div>
  ),
};
