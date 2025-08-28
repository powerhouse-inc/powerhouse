import { Icon } from "@powerhousedao/design-system";
import type { Meta, StoryObj } from "@storybook/react";
import { ConnectSearchBar, type ConnectSearchBarProps } from "./search-bar.js";

const filterItems: ConnectSearchBarProps["filterItems"] = [
  {
    id: "project",
    label: ".project",
    icon: <Icon className="text-red-700" name="Project" size={16} />,
  },
  {
    id: "budget",
    label: ".budget",
    icon: <Icon className="text-purple-900" name="BarChart" size={16} />,
  },
  {
    id: "profile",
    label: ".profile",
    icon: <Icon className="text-blue-900" name="Person" size={16} />,
  },
  {
    id: "legal",
    label: ".legal",
    icon: <Icon className="text-green-900" name="Briefcase" size={16} />,
  },
  {
    id: "atlas",
    label: ".Atlas",
    icon: <Icon className="text-orange-900" name="Globe" size={16} />,
  },
];

const meta: Meta<typeof ConnectSearchBar> = {
  title: "Connect/Components/SearchBar",
  component: ConnectSearchBar,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    placeholder: "Search Files",
    filterLabel: "File type",
    filterItems,
  },
};
