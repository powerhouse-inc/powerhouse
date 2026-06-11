import { useCallback, useEffect } from "react";
import { twMerge } from "tailwind-merge";
import { Icon } from "../../../powerhouse/index.js";
import { SidebarContentArea } from "./subcomponents/sidebar-content-area.js";
import { SidebarHeader } from "./subcomponents/sidebar-header.js";
import { SidebarPinningArea } from "./subcomponents/sidebar-pinning-area.js";
import { useSidebar } from "./subcomponents/sidebar-provider/index.js";
import { SidebarSearch } from "./subcomponents/sidebar-search/index.js";
import type { NodeSortOrder, NodeSortType, SidebarNode } from "./types.js";
import { useSidebarResize } from "./use-sidebar-resize.js";
import { triggerEvent } from "./utils.js";

export interface SidebarProps {
  /**
   * The ID of the currently active node
   */
  activeNodeId?: string;
  /**
   * Callback function to update the active node
   */
  onActiveNodeChange?: (newNode: SidebarNode) => void;
  /**
   * The nodes to be displayed in the sidebar
   */
  nodes?: SidebarNode[];
  /**
   * Which level should be shown by default (i.e., level 1).
   * @default 1 It is 1-indexed.
   */
  defaultLevel?: number;
  /**
   * Enables the vertical resizing of the sidebar
   * @default true
   */
  resizable?: boolean;
  /**
   * Whether pinning functionality is enabled for nodes
   * @default true
   */
  allowPinning?: boolean;
  /**
   * Configurable levels (e.g., 4). If its zero, then no buttons are shown (default).
   * @default 0
   */
  enableMacros?: number;
  /**
   * Whether to display the search bar in the sidebar
   * @default true
   */
  showSearchBar?: boolean;
  /**
   * Whether to display the status filter button in the sidebar. This option is ignored if `showSearchBar` is `false`.
   * @default false
   */
  showStatusFilter?: boolean;
  /**
   * The title that appears at the top of the sidebar, providing context or a heading for the hierarchy displayed within it.
   */
  sidebarTitle?: string;
  /**
   * An optional icon that can be displayed next to the sidebar title or at the top of the sidebar.
   */
  sidebarIcon?: React.ReactNode;
  /**
   * An optional footer content that can be displayed at the bottom of the sidebar.
   */
  extraFooterContent?: React.ReactNode;
  /**
   * The initial width of the sidebar.
   * @default 300
   */
  initialWidth?: number;
  /**
   * The maximum width of the sidebar.
   */
  maxWidth?: number;
  /**
   * Optional className for the sidebar container
   */
  className?: string;

  /**
   * Callback function triggered when the sidebar title is clicked.
   */
  handleOnTitleClick?: () => void;

  /**
   * Whether the sidebar is in a loading state, displaying skeleton items
   * @default false
   */
  isLoading?: boolean;
  /**
   * The type of sorting to apply to all nodes recursively.
   * Can be "alphabetical", "natural", or a custom comparison function.
   * When undefined, nodes maintain their original order.
   * Affects all levels of the tree hierarchy.
   */
  nodeSortType?: NodeSortType;
  /**
   * The order direction for sorting nodes ("asc" or "desc").
   * Only applicable when nodeSortType is defined.
   * @default "asc"
   */
  nodeSortOrder?: NodeSortOrder;
}

/**
 * Sidebar component that provides a collapsible and resizable navigation panel
 * with support for hierarchical data, search, pinning, and custom styling.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  activeNodeId,
  onActiveNodeChange,
  nodes,
  sidebarIcon,
  sidebarTitle,
  defaultLevel = 1,
  enableMacros = 0,
  allowPinning = true,
  resizable = true,
  showSearchBar = true,
  showStatusFilter = false,
  extraFooterContent,
  initialWidth = 300,
  maxWidth,
  className,
  handleOnTitleClick,
  isLoading = false,
  nodeSortType,
  nodeSortOrder = "asc",
}) => {
  const {
    sidebarRef,
    startResizing,
    isResizing,
    isSidebarOpen,
    handleToggleSidebar,
  } = useSidebarResize({
    defaultWidth: initialWidth,
    minWidth: 220,
    maxWidth,
  });

  const {
    pinnedNodePath,
    setNodes,
    openLevel,
    togglePin,
    syncActiveNodeId,
    setActiveNodeChangeCallback,
    nodes: providerNodes,
    nodeSortType: currentSortType,
    nodeSortOrder: currentSortOrder,
  } = useSidebar();

  useEffect(() => {
    if (nodes) {
      setNodes(nodes, nodeSortType, nodeSortOrder);
    }
  }, [nodes, setNodes, nodeSortType, nodeSortOrder]);

  useEffect(() => {
    if (
      !nodes &&
      providerNodes.length > 0 &&
      (nodeSortType !== currentSortType || nodeSortOrder !== currentSortOrder)
    ) {
      setNodes(providerNodes, nodeSortType, nodeSortOrder);
    }
  }, [
    nodes,
    providerNodes,
    setNodes,
    nodeSortType,
    nodeSortOrder,
    currentSortType,
    currentSortOrder,
  ]);

  // Initialize default expanded level on mount.
  // openLevel intentionally omitted — it changes every time currentRoots
  // changes, which would cause an infinite loop.
  useEffect(() => {
    if (defaultLevel > 1) {
      openLevel(defaultLevel);
    }
  }, [defaultLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleActiveNodeChange = useCallback(
    (node: SidebarNode) => {
      onActiveNodeChange?.(node);
      triggerEvent("sidebar:change", { node }, sidebarRef.current);
    },
    [onActiveNodeChange, sidebarRef],
  );
  useEffect(() => {
    syncActiveNodeId(activeNodeId);
  }, [activeNodeId, syncActiveNodeId]);

  useEffect(() => {
    setActiveNodeChangeCallback(handleActiveNodeChange);
  }, [handleActiveNodeChange, setActiveNodeChangeCallback]);

  useEffect(() => {
    const hasPinnedNodes = pinnedNodePath.length > 0;
    if (!allowPinning && hasPinnedNodes) {
      const lastPinnedNodeId = pinnedNodePath[pinnedNodePath.length - 1].id;
      togglePin(lastPinnedNodeId);
    }
  }, [allowPinning, pinnedNodePath, togglePin]);

  return (
    <aside
      ref={sidebarRef}
      style={{ width: "min(100%, var(--sidebar-width))" }}
      className={twMerge(
        "group peer relative flex h-svh max-h-screen flex-col bg-gray-50 shadow-lg transition-[width] duration-75 ease-linear dark:bg-slate-600",
        isResizing && "transition-none",
        className,
      )}
    >
      {isSidebarOpen && (
        <>
          <SidebarHeader
            sidebarTitle={sidebarTitle}
            sidebarIcon={sidebarIcon}
            enableMacros={enableMacros}
            handleOnTitleClick={handleOnTitleClick}
          />

          {allowPinning && pinnedNodePath.length > 0 && <SidebarPinningArea />}
          <SidebarContentArea
            allowPinning={allowPinning}
            isLoading={isLoading}
          />
          {showSearchBar && (
            <SidebarSearch showStatusFilter={showStatusFilter} />
          )}
          {extraFooterContent && (
            <div className="w-full border-t border-gray-300 p-2 dark:border-slate-500">
              {extraFooterContent}
            </div>
          )}
        </>
      )}

      {resizable && (
        <div
          className="group/sidebar-resizer absolute top-0 right-0 h-full w-[10px] translate-x-1/2 cursor-ew-resize select-none"
          onMouseDown={startResizing}
        >
          <div
            className={twMerge(
              "relative h-full w-px translate-x-[5px] transition-colors group-hover/sidebar-resizer:effect dark:group-hover/sidebar-resizer:effect",
              isResizing && "cursor-default bg-blue-500",
              !isSidebarOpen && "bg-gray-300 dark:bg-slate-600",
            )}
          >
            <button
              type="button"
              className={twMerge(
                "absolute top-14 right-0 size-4 translate-x-1/2 rounded-full bg-gray-500 dark:bg-slate-900",
                "opacity-0 transition-opacity group-hover/sidebar-resizer:opacity-100",
              )}
              onClick={handleToggleSidebar}
            >
              <Icon
                name="Caret"
                size={16}
                className={twMerge(
                  "min-w-4 text-gray-50 dark:text-slate-500",
                  isSidebarOpen && "-rotate-180",
                )}
              />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
