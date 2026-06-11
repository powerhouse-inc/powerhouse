import type { ComponentProps } from "react";
import { twMerge } from "tailwind-merge";

/**
 * Default outer container for `DocumentToolbar`.
 *
 * This component provides the toolbar's base layout and visual styling while
 * still accepting standard `div` props. Pass a custom container to
 * `DocumentToolbar` when you need to replace this wrapper.
 */
export function ToolbarContainer(props: ComponentProps<"div">) {
  const { children, className, ...rest } = props;

  return (
    <div
      {...rest}
      className={twMerge(
        "flex h-12 w-full items-center justify-between rounded-xl border border-gray-300 bg-gray-50 px-4 dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Default container for a group of toolbar controls.
 *
 * `DocumentToolbar` renders one controls container per toolbar slot. This
 * component provides the default horizontal layout for the controls in that
 * slot while still accepting standard `div` props.
 */
export function ToolbarControlsContainer(props: ComponentProps<"div">) {
  const { children, className, ...rest } = props;

  return (
    <div className={twMerge("flex items-center gap-x-2", className)} {...rest}>
      {children}
    </div>
  );
}
