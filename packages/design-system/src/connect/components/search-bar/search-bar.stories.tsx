import { Icon } from "#design-system";
import type { Meta, StoryObj } from "@storybook/react";
import type { ConnectSearchBarProps } from "./search-bar.js";
import { ConnectSearchBar } from "./search-bar.js";

const filterItems: ConnectSearchBarProps["filterItems"] = [
  {
    id: "project",
    label: ".project",
    icon: <Icon className="text-destructive" name="Project" size={16} />,
  },
  {
    id: "budget",
    label: ".budget",
    icon: <Icon className="text-info" name="BarChart" size={16} />,
  },
  {
    id: "profile",
    label: ".profile",
    icon: <Icon className="text-info" name="Person" size={16} />,
  },
  {
    id: "legal",
    label: ".legal",
    icon: <Icon className="text-success" name="Briefcase" size={16} />,
  },
  {
    id: "atlas",
    label: ".Atlas",
    icon: <Icon className="text-warning" name="Globe" size={16} />,
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
