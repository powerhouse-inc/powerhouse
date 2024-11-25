import * as React from "react";
import { cn } from "@/scalars/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const inputBaseStyles = cn(
  // Base styles
  "flex h-10 w-full rounded-md text-sm text-gray-900 dark:text-gray-50",
  // Border & Background
  "dark:border-charcoal-700 dark:bg-charcoal-900 border border-gray-300 bg-white",
  // Padding
  "px-3 py-2",
  // Placeholder
  "font-sans placeholder:text-gray-600 dark:placeholder:text-gray-500",
  // Focus styles
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-900 focus-visible:ring-offset-1 focus-visible:ring-offset-white",
  "dark:focus-visible:ring-charcoal-300 dark:focus-visible:ring-offset-charcoal-900",
  // Disabled state
  "disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-500",
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

export { Input };
