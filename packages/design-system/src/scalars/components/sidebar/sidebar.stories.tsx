import type { Meta, StoryObj } from "@storybook/react";
import { Sidebar } from "./sidebar";
import { Icon } from "@/powerhouse";
import { SidebarProvider } from "./subcomponents/sidebar-provider";
import mockedTree from "./mocked_tree.json";
import { useState } from "react";
import { SidebarNode } from "./types";

const meta: Meta<typeof Sidebar> = {
  title: "Document Engineering/Complex Components/Sidebar",
  component: Sidebar,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <SidebarProvider nodes={mockedTree as SidebarNode[]}>
        <Story />
      </SidebarProvider>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    activeNodeId: {
      control: "text",
      description: "The id of the node that is currently active.",
    },
    nodes: {
      control: "object",
      table: {
        readonly: true,
      },
      description:
        "The nodes to be displayed in the sidebar. It can be provided through the SidebarProvider to prevent flickering.",
    },
    sidebarTitle: {
      control: "text",
      description: "The title of the sidebar.",
    },
    sidebarIcon: {
      control: "object",
      table: {
        readonly: true,
      },
      description: "The icon of the sidebar.",
    },
    defaultLevel: {
      control: "number",
      description: "The level to be opened by default.",
      table: {
        defaultValue: { summary: "1" },
      },
    },
    enableMacros: {
      control: "number",
      description:
        "The number of macros to be displayed in the sidebar. Recommended up to 4.",
    },
    allowPinning: {
      control: "boolean",
      description: "Whether the sidebar items can be pinned.",
    },
    resizable: {
      control: "boolean",
      description: "Whether the sidebar is resizable.",
    },
    showSearchBar: {
      control: "boolean",
      description: "Whether the sidebar allows searching.",
    },
  },
  args: {
    sidebarTitle: "Title Sidebar",
    sidebarIcon: (
      <div className="flex items-center justify-center rounded-md bg-gray-900 p-2">
        <Icon name="M" className="text-gray-50" size={16} />
      </div>
    ),
    enableMacros: 4,
    onActiveNodeChange: (nodeId) => {
      console.log("onActiveNodeChange", nodeId);
    },
  },
};

export default meta;
type Story = StoryObj<typeof Sidebar>;

export const Default: Story = {};

export const WithinLayoutAndContent: Story = {
  render: (args) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [activeNode, setActiveNode] = useState<string>(
      "4281ab93-ef4f-4974-988d-7dad149a693d",
    );
    return (
      <div className="flex h-svh w-full">
        <Sidebar
          {...args}
          onActiveNodeChange={setActiveNode}
          activeNodeId={activeNode}
        />
        <div
          style={{ width: "calc(100% - var(--sidebar-width))" }}
          className="flex-1 bg-gray-50 p-4 dark:bg-slate-800"
        >
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            Content Area
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Active Node: {activeNode}
          </p>
        </div>
      </div>
    );
  },
};
