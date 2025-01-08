import type { Meta, StoryObj } from "@storybook/react";
import { Sidebar } from "./sidebar";
import { Icon } from "@/powerhouse";

const meta: Meta<typeof Sidebar> = {
  title: "Document Engineering/Complex Components/Sidebar",
  component: Sidebar,
  tags: ["autodocs"],
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

export const Default: Story = {
  args: {},
};

export const WithoutMacros: Story = {
  args: {
    enableMacros: undefined,
  },
};
