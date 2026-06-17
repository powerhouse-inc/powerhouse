import { twMerge } from "tailwind-merge";
import { ConnectTooltip } from "../tooltip/tooltip.js";

type SidebarItemProps = {
  readonly icon?: React.JSX.Element;
  readonly title: string;
  readonly description?: string;
  readonly containerClassName?: string;
  readonly active?: boolean;
  readonly onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
};
export const SidebarItem = function SidebarItem(props: SidebarItemProps) {
  const {
    icon,
    title,
    description: _description,
    containerClassName,
    active,
    onClick,
  } = props;
  return (
    <ConnectTooltip
      content={title}
      side="right"
      sideOffset={12}
      className="border-none bg-primary px-3 py-2 text-sm text-primary-foreground"
    >
      <div
        className={twMerge(
          "group/sidebar-item relative flex cursor-pointer flex-col items-center justify-center text-center text-sm text-foreground",
          containerClassName,
          active && "bg-sidebar-accent text-sidebar-accent-foreground",
          onClick && "cursor-pointer",
        )}
        onClick={onClick}
      >
        {active ? (
          <div className="absolute top-1/2 left-0 h-10 w-1 -translate-y-1/2 rounded-r-sm bg-info" />
        ) : (
          <div className="absolute top-1/2 left-0 h-6 w-1 -translate-y-1/2 rounded-r-sm bg-secondary opacity-0 transition-opacity group-hover/sidebar-item:opacity-100" />
        )}
        <div className="mx-auto py-4">
          {icon || (
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-medium text-primary-foreground">
                {title.slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </div>
    </ConnectTooltip>
  );
};
