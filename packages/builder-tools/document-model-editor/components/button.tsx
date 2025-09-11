import type { ComponentPropsWithRef } from "react";
import { forwardRef } from "react";
import { cn } from "../utils/style.js";

type Props = ComponentPropsWithRef<"button">;

export const Button = forwardRef<HTMLButtonElement, Props>((props, ref) => {
  const { className, ...rest } = props;
  return (
    <button
      ref={ref}
      {...rest}
      className={cn(
        "h-10 whitespace-nowrap rounded-md border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    />
  );
});
