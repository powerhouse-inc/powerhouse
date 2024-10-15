import React from "react";
import { twMerge } from "tailwind-merge";

export interface FormMessageProps extends React.PropsWithChildren {
  type: "error" | "info" | "warning";
}

export const FormMessage: React.FC<FormMessageProps> = ({ children, type }) => {
  const typeClasses: Record<FormMessageProps["type"], string> = {
    error: "text-red-900 dark:text-red-700",
    info: "text-blue-900 dark:text-blue-900",
    warning: "text-orange-900 dark:text-orange-900",
  };

  const classes = twMerge(
    "inline-flex items-center text-xs font-medium",
    typeClasses[type],
  );

  // TODO: add icon
  return <div className={classes}>{children}</div>;
};
