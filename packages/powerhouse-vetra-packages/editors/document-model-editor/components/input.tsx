import * as React from "react";
import { twMerge } from "tailwind-merge";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={twMerge(
          "flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm transition-colors hover:hover-effect focus-visible:bg-secondary focus-visible:outline-none disabled:disabled-effect",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
