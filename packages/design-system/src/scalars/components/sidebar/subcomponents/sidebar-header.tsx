"use client";

import { useSidebar } from "./sidebar-provider";

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
  const { openLevel } = useSidebar();
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
        <div className="flex items-center gap-2">
          {Array.from({ length: Math.min(enableMacros, 4) }).map((_, index) => (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={`macro-${index}`}
              role="button"
              className="w-[26px] rounded-lg bg-slate-50 p-1 text-center text-xs text-slate-100 hover:bg-slate-100 hover:text-slate-200 dark:bg-gray-900 dark:text-slate-200 dark:hover:bg-gray-600 dark:hover:text-slate-50"
              onClick={() => openLevel(index + 1)}
            >
              {index + 1}
            </div>
          ))}
        </div>
      )}
    </header>
  );
};
