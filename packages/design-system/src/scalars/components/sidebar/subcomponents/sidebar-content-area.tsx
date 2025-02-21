"use client";

import { useEffect } from "react";
import { useSidebar } from "./sidebar-provider";
import { AutoSizer, List } from "react-virtualized";
import { SidebarItem } from "./sidebar-item";
import { cn } from "@/scalars/lib";
import { Icon } from "@/powerhouse";

interface SidebarContentAreaProps {
  allowPinning?: boolean;
}

export const SidebarContentArea = ({
  allowPinning,
}: SidebarContentAreaProps) => {
  const {
    flattenedNodes,
    toggleNode,
    togglePin,
    searchTerm,
    searchResults,
    activeSearchIndex,
    pinnedNodePath,
    activeNodeId,
    virtualListRef,
    onActiveNodeChange,
  } = useSidebar();
  const hasPinnedItems = allowPinning && pinnedNodePath.length > 0;

  // scroll into view when navigating between search results
  useEffect(() => {
    if (
      searchResults.length > 0 &&
      activeSearchIndex >= 0 &&
      activeSearchIndex < searchResults.length
    ) {
      const { id } = searchResults[activeSearchIndex];
      // scroll into view
      for (let i = 0; i < flattenedNodes.length; i++) {
        if (flattenedNodes[i].id === id) {
          virtualListRef.current?.scrollToRow(i);
        }
      }
    }
  }, [activeSearchIndex, flattenedNodes, searchResults, virtualListRef]);

  const renderNode = ({
    index,
    key,
    style,
  }: {
    index: number;
    key: string;
    style: React.CSSProperties;
  }) => {
    const node = flattenedNodes[index];

    return (
      <SidebarItem
        key={key}
        node={node}
        toggleNode={toggleNode}
        togglePin={togglePin}
        searchTerm={searchTerm}
        searchResults={searchResults}
        activeSearchIndex={activeSearchIndex}
        allowPinning={allowPinning ?? false}
        isActive={activeNodeId === node.id}
        onChange={onActiveNodeChange}
        style={style}
      />
    );
  };

  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-1 overflow-y-auto",
        hasPinnedItems && "pt-0.5",
      )}
    >
      {flattenedNodes.length === 0 ? (
        <div className="flex max-w-full items-center gap-2 p-2 text-sm leading-5 text-gray-400 dark:text-gray-400">
          <Icon name="TreeViewSlash" size={16} className="min-w-4" />
          <span className="truncate">This node is empty</span>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <AutoSizer>
            {({ width, height }) => (
              <List
                ref={virtualListRef}
                className="p-2"
                width={width}
                height={height}
                rowCount={flattenedNodes.length}
                rowHeight={32 + 8}
                rowRenderer={renderNode}
              />
            )}
          </AutoSizer>
        </div>
      )}
    </div>
  );
};
