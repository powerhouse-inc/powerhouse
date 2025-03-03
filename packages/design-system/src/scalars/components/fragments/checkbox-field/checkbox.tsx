"use client";

import { cn } from "@/scalars/lib/utils";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as React from "react";

export type CheckboxValue = boolean | "indeterminate";

export type CheckboxProps = React.ComponentPropsWithoutRef<
  typeof CheckboxPrimitive.Root
> & {
  invalid?: boolean;
};

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, checked, invalid, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      // Base styles
      "peer size-4 shrink-0 rounded",
      // Border & Shadow
      "border-input border shadow-sm shadow-black/[.04]",
      // Background & Ring
      "ring-offset-background transition-shadow",
      // Focus styles
      "focus-visible:border-ring focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
      // Disabled state
      "disabled:cursor-not-allowed disabled:border-gray-700 disabled:data-[invalid=false]:data-[state=checked]:bg-gray-700 disabled:data-[invalid=false]:data-[state=indeterminate]:bg-gray-700 dark:disabled:data-[invalid=false]:data-[state=checked]:bg-gray-500 dark:disabled:data-[invalid=false]:data-[state=indeterminate]:bg-gray-500",
      // Checked & Indeterminate states
      "data-[state]:border-gray-700 dark:data-[state]:border-gray-500",
      "data-[state=checked]:bg-gray-900 data-[state=indeterminate]:bg-gray-900 dark:data-[state=checked]:bg-gray-400 dark:data-[state=indeterminate]:bg-gray-400",
      "data-[state=checked]:text-slate-50 data-[state=indeterminate]:text-slate-50 dark:data-[state=checked]:text-gray-900 dark:data-[state=indeterminate]:text-gray-900",
      // hover states
      !props.disabled && [
        "group-hover:border-gray-900 data-[state=checked]:group-hover:bg-gray-900 data-[state=indeterminate]:group-hover:bg-gray-900",
        "dark:group-hover:border-slate-50 dark:data-[state=checked]:group-hover:bg-slate-50 dark:data-[state=indeterminate]:group-hover:bg-slate-50",
      ],
      // Error state
      "data-[invalid=true]:data-[state]:!border-red-800 data-[invalid=true]:data-[state=checked]:!bg-red-800 data-[invalid=true]:data-[state=indeterminate]:!bg-red-800",
      "dark:data-[invalid=true]:data-[state]:!border-red-800 dark:data-[invalid=true]:data-[state=checked]:!bg-red-800 dark:data-[invalid=true]:data-[state=indeterminate]:!bg-red-800",
      // error hover states
      "data-[invalid=true]:group-hover:!border-red-900 data-[invalid=true]:data-[state=checked]:group-hover:!bg-red-900 data-[invalid=true]:data-[state=indeterminate]:group-hover:!bg-red-900",
      className,
    )}
    checked={checked}
    data-invalid={invalid}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      {checked === "indeterminate" ? (
        <svg
          width="9"
          height="9"
          viewBox="0 0 9 9"
          fill="currentcolor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M0.75 4.5C0.75 4.08579 1.08579 3.75 1.5 3.75H7.5C7.91421 3.75 8.25 4.08579 8.25 4.5C8.25 4.91421 7.91421 5.25 7.5 5.25H1.5C1.08579 5.25 0.75 4.91421 0.75 4.5Z"
          />
        </svg>
      ) : checked ? (
        <svg
          width="9"
          height="9"
          viewBox="0 0 9 9"
          fill="currentcolor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M8.53547 0.62293C8.88226 0.849446 8.97976 1.3142 8.75325 1.66099L4.5083 8.1599C4.38833 8.34356 4.19397 8.4655 3.9764 8.49358C3.75883 8.52167 3.53987 8.45309 3.3772 8.30591L0.616113 5.80777C0.308959 5.52987 0.285246 5.05559 0.563148 4.74844C0.84105 4.44128 1.31533 4.41757 1.62249 4.69547L3.73256 6.60459L7.49741 0.840706C7.72393 0.493916 8.18868 0.396414 8.53547 0.62293Z"
          />
        </svg>
      ) : null}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));

export { Checkbox };
