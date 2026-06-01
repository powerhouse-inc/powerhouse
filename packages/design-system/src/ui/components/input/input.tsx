import * as React from "react";
import { twMerge } from "tailwind-merge";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const inputBaseStyles = twMerge(
  // Base styles
  "flex h-9 w-full rounded-md text-sm/5 font-normal text-gray-800 dark:text-slate-100",
  // Border & Background
  "border border-gray-300 bg-gray-50 dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100",
  // Padding
  "px-3 py-2",
  // Placeholder
  "font-sans placeholder:text-gray-500 dark:placeholder:text-slate-400",
  // Focus styles
  "focus-visible:ring-1 focus-visible:ring-gray-900 focus-visible:ring-offset-0 focus-visible:ring-offset-white focus-visible:outline-none",
  "focus:bg-gray-50 dark:focus:bg-slate-700 dark:focus-visible:ring-slate-400 dark:focus-visible:ring-offset-slate-800",
  // Disabled state
  "disabled:cursor-not-allowed",
  "disabled:border-gray-300 disabled:bg-gray-50 disabled:text-gray-700 dark:disabled:border-slate-500 dark:disabled:bg-slate-700 dark:disabled:placeholder:text-slate-400",
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
