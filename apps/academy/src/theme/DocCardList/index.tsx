import React, { type ReactNode } from "react";
import clsx from "clsx";
import {
  useCurrentSidebarCategory,
  filterDocCardListItems,
} from "@docusaurus/plugin-content-docs/client";
import DocCard from "@theme/DocCard";
import type { Props } from "@theme/DocCardList";

function DocCardListForCurrentSidebarCategory({ className }: Props) {
  const category = useCurrentSidebarCategory();
  return <DocCardList items={category.items} className={className} />;
}

export default function DocCardList(props: Props): ReactNode {
  const { items, className } = props;
  if (!items) {
    return <DocCardListForCurrentSidebarCategory {...props} />;
  }
  const filteredItems = filterDocCardListItems(items);
  return (
    <section className={clsx("doc-card-list", className)}>
      {filteredItems.map((item, index) => (
        <article key={index} className="doc-card-list-item margin-bottom--lg">
          <DocCard item={item} />
        </article>
      ))}
    </section>
  );
}
