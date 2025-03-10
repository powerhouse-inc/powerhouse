import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu.js";

const meta = {
  title: "Powerhouse/Components/DropdownMenu",
  component: DropdownMenu,
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

const items = [
  {
    id: "item-1",
    content: "Item 1",
  },
  {
    id: "item-2",
    content: "Item 2",
  },
  {
    id: "item-3",
    content: "Item 3",
  },
];

const content = (
  <DropdownMenuContent className="w-64 cursor-pointer rounded border-2 border-blue-600 bg-white">
    {items.map((item) => (
      <DropdownMenuItem
        className="px-2 hover:bg-gray-200"
        id={item.id}
        key={item.id}
      >
        {item.content}
      </DropdownMenuItem>
    ))}
  </DropdownMenuContent>
);

export const Uncontrolled: Story = {
  render: function Wrapper(args) {
    return (
      <DropdownMenu {...args}>
        <DropdownMenuTrigger>☰</DropdownMenuTrigger>
        {content}
      </DropdownMenu>
    );
  },
};

export const Controlled: Story = {
  render: function Wrapper(args) {
    const [open, setOpen] = useState(true);
    function toggleDropdown() {
      setOpen(!open);
    }

    return (
      <DropdownMenu {...args} onOpenChange={setOpen} open={open}>
        <DropdownMenuTrigger onClick={toggleDropdown}>
          Toggle
        </DropdownMenuTrigger>
        {content}
      </DropdownMenu>
    );
  },
};
