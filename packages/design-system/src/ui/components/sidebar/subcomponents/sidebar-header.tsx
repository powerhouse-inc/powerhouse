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
  const baseTitleClasses = "truncate text-sm font-semibold text-foreground";
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
    <header className="flex items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar p-4">
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
                  "w-[26px] rounded-lg bg-sidebar p-1 text-center text-xs text-sidebar-foreground",
                  !isDisabled && "hover:hover-effect",
                  isDisabled &&
                    "cursor-not-allowed bg-muted text-muted-foreground",
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
