"use client";

import { SidebarHeader } from "./subcomponents/sidebar-header";
import { SidebarPinningArea } from "./subcomponents/sidebar-pinning-area";
import { SidebarSearch } from "./subcomponents/sidebar-search";
import { SidebarNode } from "./types";
import { useSidebar } from "./subcomponents/sidebar-provider";
import { useSidebarResize } from "./use-sidebar-resize";
import { SidebarContentArea } from "./subcomponents/sidebar-content-area";
import { useEffect } from "react";
import { cn } from "@/scalars/lib";
import { Icon } from "@/powerhouse";

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
  resizable?: boolean; // default to true
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
}

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
  } = useSidebar();

  // sync param nodes with provider state if provided
  useEffect(() => {
    if (nodes) {
      setNodes(nodes);
    }
  }, [nodes, setNodes]);

  // open levels on mount
  useEffect(() => {
    if (defaultLevel > 1) {
      openLevel(defaultLevel);
    }
    // openLevel can not be added as dependency because
    // it will cause an infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultLevel]);

  // sync activeNodeId and onActiveNodeChange with provider state
  useEffect(() => {
    syncActiveNodeId(activeNodeId);
  }, [activeNodeId, syncActiveNodeId]);
  useEffect(() => {
    if (onActiveNodeChange) {
      setActiveNodeChangeCallback(onActiveNodeChange);
    }
  }, [onActiveNodeChange, setActiveNodeChangeCallback]);

  // unpin nodes if allowPinning changes to false
  useEffect(() => {
    if (!allowPinning && pinnedNodePath.length > 0) {
      togglePin(pinnedNodePath[pinnedNodePath.length - 1].id);
    }
  }, [allowPinning, pinnedNodePath, togglePin]);

  return (
    <aside
      ref={sidebarRef}
      style={{ width: "min(100%, var(--sidebar-width))" }}
      className={cn(
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
          />

          {allowPinning && pinnedNodePath.length > 0 && <SidebarPinningArea />}
          <SidebarContentArea allowPinning={allowPinning} />
          {showSearchBar && (
            <SidebarSearch showStatusFilter={showStatusFilter} />
          )}
          {extraFooterContent && (
            <div className="w-full border-t border-gray-300 p-2 dark:border-gray-800">
              {extraFooterContent}
            </div>
          )}
        </>
      )}

      {resizable && (
        <div
          className="group/sidebar-resizer absolute right-0 top-0 h-full w-[10px] translate-x-1/2 cursor-ew-resize select-none"
          onMouseDown={startResizing}
        >
          <div
            className={cn(
              "relative h-full w-px translate-x-[5px] transition-colors group-hover/sidebar-resizer:bg-gray-500 dark:group-hover/sidebar-resizer:bg-gray-600",
              isResizing && "cursor-default bg-blue-500",
              !isSidebarOpen && "bg-gray-300 dark:bg-gray-600",
            )}
          >
            <button
              type="button"
              className={cn(
                "absolute right-0 top-14 size-4 translate-x-1/2 rounded-full bg-gray-500 dark:bg-gray-900",
                "opacity-0 transition-opacity group-hover/sidebar-resizer:opacity-100",
              )}
              onClick={handleToggleSidebar}
            >
              {/* eslint-disable-next-line react/jsx-max-depth */}
              <Icon
                name="Caret"
                size={16}
                className={cn("min-w-4 text-gray-50 dark:text-gray-500", {
                  "-rotate-180": isSidebarOpen,
                })}
              />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
