import { Icon } from "@powerhousedao/design-system";
import {
  cn,
  Sidebar,
  SidebarProvider,
  type SidebarNode,
} from "@powerhousedao/design-system/scalars";
import React from "react";
import mockedTree from "./mocked_tree.json";

export function EditorLayout({ children }: React.PropsWithChildren) {
  return (
    <SidebarProvider nodes={mockedTree as SidebarNode[]}>
      <main className="-m-4 flex size-[calc(100%+32px)] overflow-hidden rounded-2xl">
        {/* 
          TODO: remove this div once we fix tailwind css issues
          we need to add classes that are not being applied correctly
          to the sidebar or other `design-system` components
        */}
        <div
          className={cn(
            "d-none relative h-full w-px translate-x-[5px] transition-colors group-hover/sidebar-resizer:bg-gray-500",
            "absolute right-0 top-14 size-4 translate-x-1/2 rounded-full bg-gray-500 opacity-0 transition-opacity group-hover/sidebar-resizer:opacity-100",
            "group/sidebar-resizer absolute right-0 top-0 h-full w-[10px] translate-x-1/2 cursor-ew-resize select-none",
            "flex h-9 w-full appearance-none rounded-md border border-gray-300 bg-white px-3 py-2 !pl-8 font-sans text-sm font-normal leading-5 text-gray-900 placeholder:text-gray-500 focus:bg-gray-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-900 focus-visible:ring-offset-0 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-white disabled:text-gray-700",
            "w-[26px] rounded-lg bg-slate-50 p-1 text-center text-xs text-slate-100 hover:bg-slate-100 hover:text-slate-200",
            "min-h-4 min-w-4",
          )}
        />
        <Sidebar
          activeNodeId="4281ab93-ef4f-4974-988d-7dad149a693d"
          enableMacros={4}
          sidebarIcon={
            <div className="flex items-center justify-center rounded-md bg-gray-900 p-2">
              <Icon className="text-gray-50" name="M" size={16} />
            </div>
          }
          sidebarTitle="Atlas"
        />
        <div
          className="flex-1 bg-gray-50 p-4 dark:bg-slate-800"
          style={{
            width: "calc(100% - var(--sidebar-width))",
          }}
        >
          {children}
        </div>
      </main>
    </SidebarProvider>
  );
}
