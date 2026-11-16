import type { PropSidebarItemCategory } from "@docusaurus/plugin-content-docs";
import type { WrapperProps } from "@docusaurus/types";
import Category from "@theme-original/DocSidebarItem/Category";
import type CategoryType from "@theme/DocSidebarItem/Category";
import React from "react";

type Props = WrapperProps<typeof CategoryType>;

/** The entries a reader sees when the category is expanded. */
function countEntries(category: PropSidebarItemCategory): number {
  return category.items.filter(
    (item) => item.type === "link" || item.type === "category",
  ).length;
}

export default function CategoryWrapper(props: Props): React.JSX.Element {
  const { item, level } = props;

  // Only show count on top-level categories (level 1), except Release Notes
  if (level !== 1 || item.label === "Release Notes") {
    return <Category {...props} />;
  }

  const itemCount = countEntries(item);

  // Clone the item with a modified label that includes the count
  const modifiedItem = {
    ...item,
    label: (
      <>
        {item.label}
        <span className="sidebar-item-count">{itemCount}</span>
      </>
    ) as unknown as string,
  };

  return <Category {...props} item={modifiedItem} />;
}
