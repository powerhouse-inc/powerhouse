import type { PropSidebarItem } from "@docusaurus/plugin-content-docs";
import type { WrapperProps } from "@docusaurus/types";
import Category from "@theme-original/DocSidebarItem/Category";
import type CategoryType from "@theme/DocSidebarItem/Category";
import React from "react";

type Props = WrapperProps<typeof CategoryType>;

// Count only immediate children (docs, links, and categories)
function countItems(items: PropSidebarItem[]): number {
  let count = 0;
  for (const item of items) {
    if (
      // @ts-expect-error TODO: check this type
      item.type === "doc" ||
      item.type === "link" ||
      item.type === "category"
    ) {
      count += 1;
    }
  }
  return count;
}

export default function CategoryWrapper(props: Props): React.JSX.Element {
  const { item, level } = props;

  // Only show count on top-level categories (level 1)
  if (level !== 1) {
    return <Category {...props} />;
  }

  const itemCount = countItems(item.items);

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
