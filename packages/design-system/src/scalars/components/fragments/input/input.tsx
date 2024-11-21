import * as React from "react";
import { cn } from "@/scalars/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Base styles
          "flex h-10 w-full rounded-md text-sm text-gray-900 dark:text-gray-50",
          // Border & Background
          "border border-gray-300 bg-white dark:border-charcoal-700 dark:bg-charcoal-900",
          // Padding
          "px-3 py-2",
          // Placeholder
          "font-sans placeholder:text-gray-600 dark:placeholder:text-gray-500",
          // Focus styles
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-900 dark:focus-visible:ring-charcoal-300",
          // Disabled state
          "disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-500",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);

export { Input };
