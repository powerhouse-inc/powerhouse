import type { ConnectSearchBarProps } from "@powerhousedao/design-system";
import { ConnectSearchBar, Icon } from "@powerhousedao/design-system";
import { useTranslation } from "react-i18next";

const defaultFilterItems: ConnectSearchBarProps["filterItems"] = [
  {
    id: "project",
    label: ".project",
    icon: <Icon name="Project" color="#FF6A55" size={16} />,
  },
  {
    id: "budget",
    label: ".budget",
    icon: <Icon name="BarChart" color="#8E55EA" size={16} />,
  },
  {
    id: "profile",
    label: ".profile",
    icon: <Icon name="Person" color="#3E90F0" size={16} />,
  },
  {
    id: "legal",
    label: ".legal",
    icon: <Icon name="Briefcase" color="#4BAB71" size={16} />,
  },
  {
    id: "atlas",
    label: ".Atlas",
    icon: <Icon name="Globe" color="#FF8A00" size={16} />,
  },
];

export const SearchBar = () => {
  const { t } = useTranslation();

  return (
    <ConnectSearchBar
      className="max-w-searchbar-width m-4 shrink-0 bg-gray-100"
      placeholder={t("searchbar.placeholder")}
      filterLabel={t("searchbar.filterLabel")}
      filterItems={defaultFilterItems}
    />
  );
};
