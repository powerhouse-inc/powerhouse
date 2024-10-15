import { Icon } from "@/powerhouse/components/icon";
import React from "react";
import { twMerge } from "tailwind-merge";

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
    "inline-flex items-center text-sm font-semibold text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50",
    required && "after:ml-0.5 after:text-blue-700 after:content-['*']",
    hasError &&
      "text-red-700 after:text-red-700 hover:text-red-900 hover:after:text-red-900 dark:text-red-700 dark:hover:text-red-900 dark:hover:after:text-red-900",
    disabled && "cursor-not-allowed text-gray-600",
    className,
  );

  const extraProps = {
    ...htmlLabelProps,
  };

  return (
    <label role="label" className={classes} {...extraProps}>
      {children}

      {description && (
        // TODO: add tooltip with the description
        <Icon
          name="CircleInfo"
          size={16}
          className="ml-1 cursor-pointer text-gray-600"
        />
      )}
    </label>
  );
};
