import { Icon } from "@/powerhouse/components/icon";
import React from "react";
import { Tooltip, TooltipProvider } from "../tooltip";
import { cn } from "@/scalars/lib";

export interface FormLabelProps
  extends React.PropsWithChildren,
    React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  disabled?: boolean;
  description?: string;
  hasError?: boolean;
  inline?: boolean;
  className?: string;
}

export const FormLabel: React.FC<FormLabelProps> = ({
  children,
  required,
  disabled,
  description,
  hasError,
  inline,
  className,
  ...htmlLabelProps
}) => {
  const classes = cn(
    "inline-flex items-center text-sm font-medium leading-[22px]",
    `text-gray-900  ${inline ? "dark:text-gray-400" : "dark:text-gray-50"} `,
    hasError &&
      "text-red-800 group-hover:!text-red-900 dark:text-red-800 dark:group-hover:!text-red-900",
    disabled && "cursor-not-allowed text-gray-700 dark:text-gray-600",
    inline
      ? !disabled && "group-hover:text-gray-900 dark:group-hover:text-slate-50"
      : "mb-[3px]",
    className,
  );

  if (!children) {
    // no label provided
    return null;
  }

  const extraProps = {
    ...htmlLabelProps,
  };

  return (
    <label className={classes} {...extraProps}>
      {children}
      {required && (
        <span
          className={cn(
            "ml-1 text-gray-800 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-slate-50",
            hasError && "!text-red-800 group-hover:!text-red-900",
          )}
        >
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
