import type { Meta, StoryObj } from "@storybook/react";
import { Sidebar } from "./sidebar";
import { Icon } from "@/powerhouse";
import { SidebarProvider } from "./subcomponents/sidebar-provider";
import { Node } from "./types";

const meta: Meta<typeof Sidebar> = {
  title: "Document Engineering/Complex Components/Sidebar",
  component: Sidebar,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <SidebarProvider>
        <Story />
      </SidebarProvider>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    sidebarTitle: "Title Sidebar",
    sidebarIcon: (
      <div className="flex items-center justify-center rounded-md bg-gray-900 p-2">
        <Icon name="M" className="text-gray-50" size={16} />
      </div>
    ),
    enableMacros: 3,
  },
};

export default meta;
type Story = StoryObj<typeof Sidebar>;

const MOCKED_ITEMS: Node[] = [
  {
    title: "1 - Item",
    id: "1",
    childrens: [
      {
        title: "1.1 - Subitem",
        id: "1-1",
      },
      {
        title: "1.2 - Subitem",
        id: "1-2",
        childrens: [
          {
            title: "1.2.1 - Subitem",
            id: "1-2-1",
          },
          {
            title: "1.2.2 - Subitem",
            id: "1-2-2",
            childrens: [
              {
                title: "1.2.2.1 - Subitem",
                id: "1-2-2-1",
              },
              {
                title: "1.2.2.2 - Subitem",
                id: "1-2-2-2",
              },
              {
                title: "1.2.2.3 - Subitem",
                id: "1-2-2-3",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    title: "2 - Item",
    id: "2",
    childrens: [
      {
        title: "2.1 - Subitem",
        id: "2-1",
      },
    ],
  },
  {
    title: "3 - Item",
    id: "3",
  },
];

export const Default: Story = {
  args: {
    nodes: MOCKED_ITEMS,
  },
};
