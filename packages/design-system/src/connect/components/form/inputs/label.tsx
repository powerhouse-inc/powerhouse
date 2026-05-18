import type { ComponentPropsWithoutRef } from "react";
import { twMerge } from "tailwind-merge";

type LabelProps = ComponentPropsWithoutRef<"label">;

export function Label(props: LabelProps) {
  const { children, className, ...labelProps } = props;
  return (
    <label
      {...labelProps}
      className={twMerge(
        "block font-semibold text-gray-500 dark:text-slate-100",
        className,
      )}
    >
      {children}
    </label>
  );
}
