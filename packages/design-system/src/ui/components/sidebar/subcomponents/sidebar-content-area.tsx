import { AutoSizer, List } from "react-virtualized";
import { twMerge } from "tailwind-merge";
import { SidebarItem } from "./sidebar-item.js";
import { useSidebar } from "./sidebar-provider/index.js";
import { SidebarSkeleton } from "./sidebar-skeleton.js";
import { Icon } from "../../../../powerhouse/index.js";

interface SidebarContentAreaProps {
  allowPinning?: boolean;
  isLoading?: boolean;
}

export const SidebarContentArea = ({
  allowPinning,
  isLoading,
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
      className={twMerge(
        "flex flex-1 flex-col gap-1 overflow-y-auto",
        hasPinnedItems && "pt-0.5",
      )}
    >
      {isLoading ? (
        <SidebarSkeleton />
      ) : flattenedNodes.length === 0 ? (
        <div className="flex max-w-full items-center gap-2 p-2 text-sm/5 text-muted-foreground">
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
