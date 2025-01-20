import { useEffect, useRef } from "react";
import { SidebarItem } from "./sidebar-item";
import { useSidebar } from "./sidebar-provider";

interface SidebarContentAreaProps {
  allowPinning?: boolean;
}

export const SidebarContentArea = ({
  allowPinning,
}: SidebarContentAreaProps) => {
  const { state, searchResults, activeSearchIndex } = useSidebar();
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const items =
    state.pinnedItems.length > 0
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
          top: nodeElement.offsetTop - 100,
          behavior: "smooth",
        });
      }
    }
  }, [activeSearchIndex, searchResults]);

  return (
    <div
      ref={contentAreaRef}
      className="flex flex-1 flex-col gap-1 overflow-y-auto p-2"
    >
      {items.map((item) => (
        <SidebarItem
          key={item.id}
          id={item.id}
          title={item.title}
          childrens={item.childrens}
          allowPinning={allowPinning}
        />
      ))}
    </div>
  );
};
