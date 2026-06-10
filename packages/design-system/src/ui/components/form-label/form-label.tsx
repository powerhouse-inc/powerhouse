import { Icon } from "#design-system";
import { twMerge } from "tailwind-merge";
import { Tooltip, TooltipProvider } from "../tooltip/tooltip.js";

export interface FormLabelProps
  extends React.PropsWithChildren, React.LabelHTMLAttributes<HTMLLabelElement> {
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
  const classes = twMerge(
    "inline-flex items-center text-sm font-medium",
    inline ? "leading-[22px]" : "leading-4",
    "text-gray-900 dark:text-slate-100",
    hasError && "group-hover:effect",
    hasError && inline && "text-red-800 dark:text-red-100",
    hasError && !inline && "text-red-900 dark:text-red-400",
    disabled && "cursor-not-allowed text-gray-700 dark:text-slate-300",
    inline ? !disabled && "group-hover:effect" : "mb-[3px]",
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
          className={twMerge(
            "ml-1 text-gray-900 group-hover:effect dark:text-slate-100",
            hasError && "text-red-900 group-hover:effect dark:text-red-100",
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
              className={twMerge(
                "ml-1 cursor-pointer text-gray-700 hover:effect dark:text-slate-200",
                disabled && "text-gray-500 dark:text-slate-400",
              )}
            />
          </Tooltip>
        </TooltipProvider>
      )}
    </label>
  );
};
