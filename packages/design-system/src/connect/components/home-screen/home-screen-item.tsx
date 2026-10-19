import { Icon } from "#design-system";
import { twMerge } from "tailwind-merge";

type HomeScreenItemProps = {
  readonly icon?: React.JSX.Element;
  readonly title: string;
  readonly description?: string;
  readonly containerClassName?: string;
  readonly shareable?: boolean;
  /** Renders a real link; `onClick` can still take plain clicks in-app. */
  readonly href?: string;
  /** Marks the link to what shows now. */
  readonly "aria-current"?: "page";
  // Method syntax keeps handlers typed for the former div element assignable.
  onClick?(this: void, event: React.MouseEvent<HTMLElement>): void;
  /** Called on hover or touch, before a likely click. */
  readonly onPreload?: () => void;
};
export const HomeScreenItem = function HomeScreenItem(
  props: HomeScreenItemProps,
) {
  const {
    icon,
    title,
    description,
    containerClassName,
    shareable,
    href,
    onClick,
    onPreload,
  } = props;
  const Element = href ? "a" : "div";
  return (
    <Element
      href={href}
      aria-current={href ? props["aria-current"] : undefined}
      className={twMerge(
        "relative flex h-24 w-40 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md p-2 text-center text-sm text-foreground hover:hover-effect",
        containerClassName,
        onClick && "cursor-pointer",
      )}
      onClick={onClick}
      onMouseEnter={onPreload}
      onTouchStart={onPreload}
      onFocus={href ? onPreload : undefined}
    >
      <div className="mx-auto pb-2">
        {icon || (
          <div className="size-8 items-center justify-center rounded-lg bg-primary pt-1">
            <span className="w-6 text-primary-foreground">
              {title.slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <div className="w-full max-w-full">
        <h3 className="w-full max-w-full truncate px-2 text-foreground">
          {title}
        </h3>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {shareable && (
        <div className="absolute top-0 left-2 mb-2">
          <Icon name="PeopleFill" width={12} height={12} />
        </div>
      )}
    </Element>
  );
};
