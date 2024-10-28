import { Icon } from "@/powerhouse/components/icon";
import React from "react";
import { twMerge } from "tailwind-merge";
import { Tooltip, TooltipProvider } from "../tooltip";

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
    "inline-flex items-center text-sm font-semibold text-gray-700  dark:text-gray-400 ",
    hasError && "text-red-700 after:text-red-700 dark:text-red-700 ",
    disabled && "cursor-not-allowed text-gray-600",
    className,
  );

  const extraProps = {
    ...htmlLabelProps,
  };

  return (
    <label role="label" className={classes} {...extraProps}>
      {children}
      {required && <span className="ml-1 text-blue-700 ">*</span>}

      {description && (
        <TooltipProvider>
          <Tooltip content={description}>
            <Icon
              name="CircleInfo"
              size={16}
              className="ml-1 cursor-pointer text-gray-600"
            />
          </Tooltip>
        </TooltipProvider>
      )}
    </label>
  );
};
