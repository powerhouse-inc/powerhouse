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
        "h-10 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium whitespace-nowrap text-foreground transition-colors hover:hover-effect focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:disabled-effect",
        className,
      )}
    />
  );
});
