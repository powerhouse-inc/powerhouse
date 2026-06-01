import type { ComponentPropsWithRef } from "react";
import { forwardRef } from "react";
import { twMerge } from "tailwind-merge";

type Props = ComponentPropsWithRef<"button">;

export const Button = forwardRef<HTMLButtonElement, Props>((props, ref) => {
  const { className, ...rest } = props;
  return (
    <button
      ref={ref}
      {...rest}
      className={twMerge(
        "h-10 rounded-md border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium whitespace-nowrap text-gray-900 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-50",
        className,
      )}
    />
  );
});
