"use client";

import { useEffect } from "react";
import { SidebarContentArea } from "./subcomponents/sidebar-content-area";
import { SidebarHeader } from "./subcomponents/sidebar-header";
import { SidebarPinningArea } from "./subcomponents/sidebar-pinning-area";
import { SidebarSearch } from "./subcomponents/sidebar-search";
import { SidebarNode } from "./types";
import { useSidebar } from "./subcomponents/sidebar-provider";
import { useSidebarResize } from "./use-sidebar-resize";
import { cn } from "@/scalars/lib";
import { Icon } from "@/powerhouse";

export interface SidebarProps {
  /**
   * The ID of the currently active node
   */
  activeNodeId?: string;
  /**
   * Callback function to update the active node ID
   */
  onActiveNodeChange?: (newActiveNodeId: string) => void;
  /**
   * The nodes to be displayed in the sidebar
   */
  nodes?: SidebarNode[];
  /**
   * Which level should be shown by default (i.e., level 1).
   */
  defaultLevel?: number; // default to 0
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
   * The title that appears at the top of the sidebar, providing context or a heading for the hierarchy displayed within it.
   */
  sidebarTitle?: string;
  /**
   * An optional icon that can be displayed next to the sidebar title or at the top of the sidebar.
   */
  sidebarIcon?: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeNodeId,
  onActiveNodeChange,
  nodes,
  sidebarIcon,
  sidebarTitle,
  enableMacros = 0,
  allowPinning = true,
  resizable = true,
  showSearchBar = true,
}) => {
  const {
    sidebarRef,
    startResizing,
    isResizing,
    isSidebarOpen,
    handleToggleSidebar,
  } = useSidebarResize({
    defaultWidth: 300,
    minWidth: 220,
  });

  const {
    state: { pinnedItems },
    setItems,
    setActiveNodeId,
    setActiveNodeChangeCallback,
  } = useSidebar();

  // sync param nodes with provider state if provided
  useEffect(() => {
    if (nodes) {
      setItems(nodes);
    }
  }, [nodes, setItems]);

  // sync activeNodeId and onActiveNodeChange with provider state
  useEffect(() => {
    setActiveNodeId(activeNodeId);
  }, [activeNodeId, setActiveNodeId]);
  useEffect(() => {
    if (onActiveNodeChange) {
      setActiveNodeChangeCallback(onActiveNodeChange);
    }
  }, [onActiveNodeChange, setActiveNodeChangeCallback]);

  return (
    <aside
      ref={sidebarRef}
      className={cn(
        "group peer relative flex h-svh max-h-screen w-[--sidebar-width] flex-col bg-gray-50 shadow-lg transition-[width] duration-75 ease-linear dark:bg-slate-600",
        isResizing && "transition-none",
      )}
    >
      {isSidebarOpen && (
        <>
          <SidebarHeader
            sidebarTitle={sidebarTitle}
            sidebarIcon={sidebarIcon}
            enableMacros={enableMacros}
          />

          {allowPinning && pinnedItems.length > 0 && <SidebarPinningArea />}
          <SidebarContentArea allowPinning={allowPinning} />
          {showSearchBar && <SidebarSearch />}
        </>
      )}

      {resizable && (
        <div
          className={cn(
            "group/sidebar-resizer absolute right-0 top-0 h-full w-px cursor-ew-resize select-none transition-colors hover:bg-gray-500 dark:hover:bg-gray-600",
            isResizing && "cursor-default bg-blue-500",
            !isSidebarOpen && "bg-gray-300 dark:bg-gray-600",
          )}
          onMouseDown={startResizing}
        >
          <button
            type="button"
            className={cn(
              "absolute right-0 top-14 size-4 translate-x-1/2 rounded-full bg-gray-500 dark:bg-gray-900",
              "opacity-0 transition-opacity group-hover/sidebar-resizer:opacity-100",
            )}
            onClick={handleToggleSidebar}
          >
            <Icon
              name="Caret"
              size={16}
              className={cn("min-w-4 text-gray-50 dark:text-gray-500", {
                "-rotate-180": isSidebarOpen,
              })}
            />
          </button>
        </div>
      )}
    </aside>
  );
};
