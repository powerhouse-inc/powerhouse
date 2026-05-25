import type { DivProps } from "#design-system";
import { twMerge } from "tailwind-merge";

export function Divider(props: DivProps) {
  return (
    <div
      {...props}
      className={twMerge(
        "h-px bg-gray-200 dark:bg-slate-600 dark:text-slate-100",
        props.className,
      )}
    />
  );
}
