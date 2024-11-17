import { Icon } from "@/powerhouse/components/icon";
import React from "react";
import { twMerge } from "tailwind-merge";
import { Tooltip, TooltipProvider } from "../tooltip";
import { cn } from "@/scalars/lib";

export interface FormLabelProps
  extends React.PropsWithChildren,
    React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  disabled?: boolean;
  description?: string;
  hasError?: boolean;
  className?: string;
}

export const FormLabel: React.FC<FormLabelProps> = ({
  children,
  required,
  disabled,
  description,
  hasError,
  className,
  ...htmlLabelProps
}) => {
  const classes = twMerge(
    "inline-flex items-center text-sm font-medium leading-[22px] text-gray-900 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-slate-50",
    hasError && "text-red-700 group-hover:text-red-900",
    disabled &&
      `cursor-not-allowed ${!hasError ? "text-gray-700 dark:text-gray-500" : ""}`,
    className,
  );

  const extraProps = {
    ...htmlLabelProps,
  };

  return (
    <label role="label" className={classes} {...extraProps}>
      {children}
      {required && (
        <span className="ml-1 text-gray-800 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-slate-50">
          *
        </span>
      )}

      {description && (
        <TooltipProvider>
          <Tooltip content={description}>
            <Icon
              name="CircleInfo"
              size={16}
              className={cn(
                "ml-1 cursor-pointer text-gray-600 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-500",
                disabled && "text-gray-500",
              )}
            />
          </Tooltip>
        </TooltipProvider>
      )}
    </label>
  );
};
