"use client";

import { SidebarItem } from "./sidebar-item.js";
import { useSidebar } from "./sidebar-provider/index.js";

export const SidebarPinningArea = () => {
  const { pinnedNodePath, togglePin, activeNodeId, onActiveNodeChange } =
    useSidebar();

  return (
    <div className="flex flex-col gap-1 border-b border-gray-300 bg-gray-100 px-2 pb-0.5 pt-2 dark:border-gray-800 dark:bg-slate-700">
      {pinnedNodePath.map((node, index) => (
        <SidebarItem
          key={node.id}
          node={{
            ...node,
            depth: 0,
            isExpanded: false,
          }}
          togglePin={togglePin}
          searchTerm={""}
          searchResults={[]}
          activeSearchIndex={0}
          allowPinning={true}
          pinnedMode={true}
          isPinned={index === pinnedNodePath.length - 1}
          isActive={activeNodeId === node.id}
          onChange={onActiveNodeChange}
        />
      ))}
    </div>
  );
};
