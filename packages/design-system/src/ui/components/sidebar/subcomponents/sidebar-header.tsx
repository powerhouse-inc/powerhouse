import { twMerge } from "tailwind-merge";
import { useSidebar } from "./sidebar-provider/index.js";

interface SidebarHeaderProps {
  sidebarTitle?: string;
  sidebarIcon?: React.ReactNode;
  enableMacros?: number;
  handleOnTitleClick?: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  sidebarTitle,
  sidebarIcon,
  enableMacros = 0,
  handleOnTitleClick,
}) => {
  const { maxDepth, openLevel } = useSidebar();
  if (!sidebarTitle && !sidebarIcon && !enableMacros) {
    return null;
  }
  let titleElement;
  const baseTitleClasses =
    "truncate text-sm font-semibold text-gray-700 dark:text-slate-300";
  if (handleOnTitleClick) {
    titleElement = (
      <button
        type="button"
        className={twMerge(baseTitleClasses, "cursor-pointer")}
        onClick={handleOnTitleClick}
      >
        {sidebarTitle}
      </button>
    );
  } else {
    titleElement = <div className={baseTitleClasses}>{sidebarTitle}</div>;
  }

  return (
    <header className="flex items-center justify-between gap-2 border-b border-gray-300 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-600">
      <div className="flex items-center gap-2 truncate">
        {sidebarIcon}
        {titleElement}
      </div>

      {enableMacros > 0 && (
        <div className="flex items-center gap-2 select-none">
          {Array.from({ length: Math.min(enableMacros, 4) }).map((_, index) => {
            const isDisabled = index + 1 > maxDepth;

            return (
              <div
                key={`macro-${index}`}
                role="button"
                tabIndex={0}
                className={twMerge(
                  "w-[26px] rounded-lg bg-gray-50 p-1 text-center text-xs text-gray-100 dark:bg-slate-900 dark:text-slate-200",
                  !isDisabled && "hover:effect",
                  isDisabled &&
                    "cursor-not-allowed bg-gray-100 text-[#E2E4E7] dark:bg-[#252728] dark:text-slate-500",
                )}
                onClick={() => {
                  if (!isDisabled) {
                    openLevel(index + 1);
                  }
                }}
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
