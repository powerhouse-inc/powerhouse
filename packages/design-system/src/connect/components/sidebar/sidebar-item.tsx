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
  const { icon, title, description, containerClassName, active, onClick } =
    props;
  return (
    <ConnectTooltip
      content={title}
      side="right"
      sideOffset={12}
      className="border-none bg-gray-800 px-3 py-2 text-sm text-white"
    >
      <div
        className={twMerge(
          "group/sidebar-item relative flex cursor-pointer flex-col items-center justify-center text-center text-sm text-black",
          containerClassName,
          active && "bg-white",
          onClick && "cursor-pointer",
        )}
        onClick={onClick}
      >
        {active ? (
          <div className="absolute left-0 top-1/2 h-10 w-1 -translate-y-1/2 rounded-r-sm bg-violet-400" />
        ) : (
          <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-sm bg-zinc-300 opacity-0 transition-opacity group-hover/sidebar-item:opacity-100" />
        )}
        <div className="mx-auto py-4">
          {icon || (
            <div className="flex size-8 items-center justify-center rounded-lg bg-black">
              <span className="text-sm font-medium text-white">
                {title.slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </div>
    </ConnectTooltip>
  );
};
