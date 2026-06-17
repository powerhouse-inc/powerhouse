import * as React from "react";
import { twMerge } from "tailwind-merge";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const inputBaseStyles = twMerge(
  // Base styles
  "flex h-9 w-full rounded-md text-sm/5 font-normal text-foreground",
  // Border & Background
  "border border-border bg-background",
  // Padding
  "px-3 py-2",
  // Placeholder
  "font-sans placeholder:text-muted-foreground disabled:disabled-effect",
  // Focus styles
  "focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:ring-offset-white focus-visible:outline-none",
  "focus:bg-background focus-visible:ring-offset-background",
  // Disabled state
  "disabled:disabled-effect",
  "disabled:disabled-effect",
);

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={twMerge(inputBaseStyles, className)}
        ref={ref}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input };
