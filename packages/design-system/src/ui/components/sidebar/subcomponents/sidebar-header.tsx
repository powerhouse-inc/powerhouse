"use client";

import { cn } from "#scalars";
import { useSidebar } from "./sidebar-provider/index.js";

interface SidebarHeaderProps {
  sidebarTitle?: string;
  sidebarIcon?: React.ReactNode;
  enableMacros?: number;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  sidebarTitle,
  sidebarIcon,
  enableMacros = 0,
}) => {
  const { maxDepth, openLevel } = useSidebar();
  if (!sidebarTitle && !sidebarIcon && !enableMacros) {
    return null;
  }

  return (
    <header className="flex items-center justify-between gap-2 border-b border-gray-300 bg-gray-50 p-4 dark:border-gray-800 dark:bg-slate-600">
      <div className="flex items-center gap-2 truncate">
        {sidebarIcon}
        <div className="truncate text-sm font-semibold text-gray-700 dark:text-gray-300">
          {sidebarTitle}
        </div>
      </div>

      {enableMacros > 0 && (
        <div className="flex select-none items-center gap-2">
          {Array.from({ length: Math.min(enableMacros, 4) }).map((_, index) => {
            const isDisabled = index + 1 > maxDepth;

            return (
              <div
                key={`macro-${index}`}
                role="button"
                tabIndex={2}
                className={cn(
                  "w-[26px] rounded-lg bg-slate-50 p-1 text-center text-xs text-slate-100 dark:bg-gray-900 dark:text-slate-200",
                  !isDisabled &&
                    "hover:bg-slate-100 hover:text-slate-200 dark:hover:bg-gray-600 dark:hover:text-slate-50",
                  isDisabled &&
                    "cursor-not-allowed bg-gray-100 text-[#E2E4E7] dark:bg-[#252728] dark:text-slate-500",
                )}
                onClick={() => !isDisabled && openLevel(index + 1)}
              >
                {index + 1}
              </div>
            );
          })}
        </div>
      )}
    </header>
  );
};
