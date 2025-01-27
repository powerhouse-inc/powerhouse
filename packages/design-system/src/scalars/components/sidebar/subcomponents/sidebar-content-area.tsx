"use client";

import { useEffect, useRef } from "react";
import { SidebarItem } from "./sidebar-item";
import { useSidebar } from "./sidebar-provider";
import { cn } from "@/scalars/lib";
import { Icon } from "@/powerhouse";

interface SidebarContentAreaProps {
  allowPinning?: boolean;
}

export const SidebarContentArea = ({
  allowPinning,
}: SidebarContentAreaProps) => {
  const { state, searchResults, activeSearchIndex } = useSidebar();
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const hasPinnedItems = state.pinnedItems.length > 0 && allowPinning;
  const items = hasPinnedItems
    ? (state.pinnedItems[state.pinnedItems.length - 1].childrens ?? [])
    : state.items;

  // scroll into view when navigating between search results
  useEffect(() => {
    if (
      searchResults.length > 0 &&
      activeSearchIndex >= 0 &&
      activeSearchIndex < searchResults.length
    ) {
      const node = searchResults[activeSearchIndex];
      // scroll into view
      const nodeElement = document.getElementById(`sidebar-item-${node.id}`);
      if (nodeElement && contentAreaRef.current) {
        contentAreaRef.current.scrollTo({
          top: nodeElement.offsetTop - contentAreaRef.current.offsetTop,
          behavior: "smooth",
        });
      }
    }
  }, [activeSearchIndex, searchResults]);

  return (
    <div
      ref={contentAreaRef}
      className={cn(
        "flex flex-1 flex-col gap-1 overflow-y-auto p-2",
        hasPinnedItems && "pt-0.5",
      )}
    >
      {items.length === 0 ? (
        <div className="flex max-w-full items-center gap-2 p-2 text-sm leading-5 text-gray-400 dark:text-gray-400">
          <Icon name="TreeViewSlash" size={16} className="min-w-4" />
          <span className="truncate">This node is empty</span>
        </div>
      ) : (
        items.map((item) => (
          <SidebarItem
            key={item.id}
            id={item.id}
            title={item.title}
            childrens={item.childrens}
            allowPinning={allowPinning}
          />
        ))
      )}
    </div>
  );
};
