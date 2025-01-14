import { useCallback, useEffect, useState } from "react";
import { SidebarContentArea } from "./subcomponents/sidebar-content-area";
import { SidebarHeader } from "./subcomponents/sidebar-header";
import { SidebarPinningArea } from "./subcomponents/sidebar-pinning-area";
import { SidebarSearch } from "./subcomponents/sidebar-search";
import { SidebarSeparator } from "./subcomponents/sidebar-separator";
import { SidebarNode } from "./types";
import { useSidebar } from "./subcomponents/sidebar-provider";

export interface SidebarProps {
  value: string; // TODO: define the type
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
  nodes,
  sidebarIcon,
  sidebarTitle,
  enableMacros = 0,
  allowPinning = true,
  // TODO: implement this
  // resizable = true,
  showSearchBar = true,
}) => {
  const [sidebarWidth, setSidebarWidth] = useState<number>(300);

  // TODO: use this handler to resize the sidebar
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleResize = useCallback((width: number) => {
    setSidebarWidth(width);
  }, []);

  const { state, setItems } = useSidebar();
  useEffect(() => {
    if (nodes) {
      setItems(nodes);
    }
  }, [nodes, setItems]);
  console.log("testing");
  return (
    <aside
      // TODO: move the variable somewhere else where it fits better
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      style={{ "--system-sidebar-width": `${sidebarWidth}px` }}
      className="group peer relative h-screen max-h-screen w-[--system-sidebar-width] bg-gray-50 shadow-lg"
    >
      <SidebarHeader
        sidebarTitle={sidebarTitle}
        sidebarIcon={sidebarIcon}
        enableMacros={enableMacros}
      />
      {allowPinning && state.pinnedItems.length > 0 && (
        <>
          <SidebarPinningArea />
          <SidebarSeparator />
        </>
      )}
      <SidebarContentArea />
      {showSearchBar && <SidebarSearch />}
    </aside>
  );
};
