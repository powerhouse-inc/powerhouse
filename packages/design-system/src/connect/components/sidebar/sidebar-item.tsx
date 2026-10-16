import { twMerge } from "tailwind-merge";
import { ConnectTooltip } from "../tooltip/tooltip.js";

type SidebarItemProps = {
  readonly icon?: React.JSX.Element;
  readonly title: string;
  readonly description?: string;
  readonly containerClassName?: string;
  readonly active?: boolean;
  /** Renders a real link; `onClick` can still take plain clicks in-app. */
  readonly href?: string;
  /** Marks the link to what shows now; styles it as `active` does. */
  readonly "aria-current"?: "page";
  // Method syntax keeps handlers typed for the former div element assignable.
  onClick?(this: void, event: React.MouseEvent<HTMLElement>): void;
  /** Called on hover or touch, before a likely click. */
  readonly onPreload?: () => void;
};
export const SidebarItem = function SidebarItem(props: SidebarItemProps) {
  const {
    icon,
    title,
    description: _description,
    containerClassName,
    active,
    href,
    onClick,
    onPreload,
  } = props;
  const Element = href ? "a" : "div";
  const current = href ? props["aria-current"] : undefined;
  return (
    <ConnectTooltip
      content={title}
      side="right"
      sideOffset={12}
      className="border-none bg-primary px-3 py-2 text-sm text-primary-foreground"
    >
      <Element
        href={href}
        aria-current={current}
        className={twMerge(
          "group/sidebar-item relative flex cursor-pointer flex-col items-center justify-center text-center text-sm text-foreground",
          containerClassName,
          "aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground",
          active && "bg-sidebar-accent text-sidebar-accent-foreground",
          onClick && "cursor-pointer",
        )}
        onClick={onClick}
        onMouseEnter={onPreload}
        onTouchStart={onPreload}
        onFocus={href ? onPreload : undefined}
      >
        <div
          className={twMerge(
            "absolute top-1/2 left-0 hidden h-10 w-1 -translate-y-1/2 rounded-r-sm bg-info group-aria-[current=page]/sidebar-item:block",
            active && "block",
          )}
        />
        <div
          className={twMerge(
            "absolute top-1/2 left-0 h-6 w-1 -translate-y-1/2 rounded-r-sm bg-secondary opacity-0 transition-opacity group-hover/sidebar-item:opacity-100 group-aria-[current=page]/sidebar-item:hidden",
            active && "hidden",
          )}
        />
        <div className="mx-auto py-4">
          {icon || (
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-medium text-primary-foreground">
                {title.slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </Element>
    </ConnectTooltip>
  );
};
