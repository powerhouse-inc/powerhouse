import * as React from "react";
import { cn } from "../../../../scalars/lib/utils.js";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const inputBaseStyles = cn(
  // Base styles
  "flex h-9 w-full rounded-md text-sm font-normal leading-5 text-gray-900 dark:text-gray-50",
  // Border & Background
  "dark:border-charcoal-700 dark:bg-charcoal-900 border border-gray-300 bg-white",
  // Padding
  "px-3 py-2",
  // Placeholder
  "font-sans placeholder:text-gray-500 dark:placeholder:text-gray-600",
  // Focus styles
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-900 focus-visible:ring-offset-0 focus-visible:ring-offset-white",
  "dark:focus-visible:ring-charcoal-300 dark:focus-visible:ring-offset-charcoal-900 dark:focus:bg-charcoal-900 focus:bg-gray-50",
  // Disabled state
  "disabled:cursor-not-allowed",
  "disabled:border-gray-300 disabled:bg-white disabled:text-gray-700",
  "disabled:dark:border-charcoal-800 disabled:dark:bg-charcoal-900 disabled:dark:text-gray-300",
);

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputBaseStyles, className)}
        ref={ref}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input };
