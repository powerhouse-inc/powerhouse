import type { Meta, StoryObj } from "@storybook/react";
import { Sidebar } from "./sidebar";
import { Icon } from "@/powerhouse";
import { SidebarProvider } from "./subcomponents/sidebar-provider";
import mockedTree from "./mocked_tree.json";
import { useState } from "react";
import { SidebarNode } from "./types";

/**
 * The `Sidebar` component can be used within a page layout to provide a sidebar navigation.
 * It provided a tree structure of nodes that can be used to navigate the application offering customization, search and more.
 *
 * The `Sidebar` component requires a `SidebarProvider` ancestor component to function correctly. The `SidebarProvider` accepts an optional `nodes` prop
 * which defines the navigation tree structure. If `nodes` is not provided to the provider, the `Sidebar` component can accept its own `nodes` prop.
 * If neither source provides nodes, the sidebar will render empty.
 *
 * Usage:
 * ```
 * <SidebarProvider nodes={nodes}>
 *   <Sidebar {...sidebarProps} />
 * </SidebarProvider>
 * ```
 *
 * The sidebar nodes are defined as follows:
 * ```
 * type SidebarNode = {
 *   id: string;
 *   title: string;
 *   children: SidebarNode[];
 *   icon?: IconName;
 *   expandedIcon?: IconName;
 *   status?: NodeStatus;
 * };
 * enum NodeStatus {
 *   CREATED = "CREATED",
 *   MODIFIED = "MODIFIED",
 *   REMOVED = "REMOVED",
 *   MOVED = "MOVED",
 *   DUPLICATED = "DUPLICATED",
 *   UNCHANGED = "UNCHANGED", // default status, no need to set it
 * }
 * ```
 *
 * The `icon` and `expandedIcon` properties are optional and can be used to display an icon in the sidebar item.
 * This icons must be one of the [available icons](?path=/docs/powerhouse-iconography--readme)
 */
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
      table: {
        defaultValue: { summary: "0" },
      },
    },
    allowPinning: {
      control: "boolean",
      description: "Whether the sidebar items can be pinned.",
      table: {
        defaultValue: { summary: "true" },
      },
    },
    resizable: {
      control: "boolean",
      description: "Whether the sidebar is resizable.",
      table: {
        defaultValue: { summary: "true" },
      },
    },
    showSearchBar: {
      control: "boolean",
      description: "Whether the sidebar allows searching.",
      table: {
        defaultValue: { summary: "true" },
      },
    },
    showStatusFilter: {
      control: "boolean",
      description: "Whether the sidebar allows filtering by status.",
      table: {
        defaultValue: { summary: "false" },
      },
    },
    extraFooterContent: {
      control: "object",
      description: "Additional content to be displayed in the sidebar footer.",
      table: {
        readonly: true,
      },
    },
    initialWidth: {
      control: "number",
      description: "The initial width of the sidebar.",
      table: {
        defaultValue: { summary: "300" },
      },
    },
    maxWidth: {
      control: "number",
      description: "The maximum width of the sidebar.",
    },
    onWidthChange: {
      control: "object",
      description:
        "A callback function that is called when the width of the sidebar changes.",
      table: {
        readonly: true,
      },
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
    onActiveNodeChange: (node) => {
      console.log("onActiveNodeChange", node);
    },
    onWidthChange: (width) => {
      console.log("onWidthChange", width);
    },
  },
};

export default meta;
type Story = StoryObj<typeof Sidebar>;

export const Default: Story = {};

/**
 * The `Sidebar` component can be used within a page layout to provide a sidebar navigation.
 * It can also be used to display additional content within the sidebar, such as authentication buttons.
 * or any other react component.
 */
export const WithinLayoutAndContent: Story = {
  args: {
    showStatusFilter: true,
  },
  render: (args) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [activeNode, setActiveNode] = useState<string>(
      "4281ab93-ef4f-4974-988d-7dad149a693d",
    );
    return (
      <main className="flex h-svh w-full">
        <Sidebar
          {...args}
          onActiveNodeChange={(node) => setActiveNode(node.id)}
          activeNodeId={activeNode}
          extraFooterContent={
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2 text-gray-900 dark:text-gray-200">
                <div>Login with</div>
                <Icon
                  name={"Renown"}
                  size={"auto"}
                  height={18}
                  className="cursor-pointer"
                />
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Auth integration example within sidebar content
              </div>
            </div>
          }
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
      </main>
    );
  },
};
