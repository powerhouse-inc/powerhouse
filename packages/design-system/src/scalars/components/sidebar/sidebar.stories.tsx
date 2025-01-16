import type { Meta, StoryObj } from "@storybook/react";
import { Sidebar } from "./sidebar";
import { Icon } from "@/powerhouse";
import { SidebarProvider } from "./subcomponents/sidebar-provider";
import mockedTree from "./mocked_tree.json";

const meta: Meta<typeof Sidebar> = {
  title: "Document Engineering/Complex Components/Sidebar",
  component: Sidebar,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <SidebarProvider nodes={mockedTree}>
        <Story />
      </SidebarProvider>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
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
  },
};

export default meta;
type Story = StoryObj<typeof Sidebar>;

export const Default: Story = {};
