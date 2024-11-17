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
          "flex h-10 w-full rounded-md text-sm text-gray-900",
          // Border & Background
          "border-input bg-background border border-gray-300",
          // Padding
          "px-3 py-2",
          // Placeholder
          "placeholder:text-gray-600",
          // Background & Ring
          "ring-offset-background",
          // Focus styles
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-900 focus-visible:ring-offset-1",
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
