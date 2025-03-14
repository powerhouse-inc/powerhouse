import type { Meta, StoryObj } from "@storybook/react";
import { ConnectDropdownMenu } from "./dropdown-menu.js";

import { Icon } from "#powerhouse";
import { useState } from "react";

const meta = {
  title: "Connect/Components/Dropdown Menu",
  component: ConnectDropdownMenu,
} satisfies Meta<typeof ConnectDropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onItemClick: () => {},
    children: null,
    items: [
      {
        id: "duplicate",
        label: "Duplicate",
        icon: <Icon name="FilesEarmark" />,
      },
      {
        id: "new-folder",
        label: "New Folder",
        icon: <Icon name="FolderPlus" />,
      },
      {
        id: "rename",
        label: "Rename",
        icon: <Icon name="Pencil" />,
      },
      {
        id: "delete",
        label: "Delete",
        icon: <Icon name="Trash" />,
        className: "text-red-900",
      },
    ],
  },
  render: function Wrapper(args) {
    const [open, setOpen] = useState(false);
    function toggleOpen() {
      setOpen(!open);
    }

    return (
      <ConnectDropdownMenu {...args} onOpenChange={setOpen} open={open}>
        <button onClick={toggleOpen}>Toggle</button>
      </ConnectDropdownMenu>
    );
  },
};
