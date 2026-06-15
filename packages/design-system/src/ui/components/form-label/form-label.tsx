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
    "text-foreground",
    hasError && "group-hover:hover-effect",
    hasError && inline && "text-destructive",
    hasError && !inline && "text-destructive",
    disabled && "cursor-not-allowed text-foreground",
    inline ? !disabled && "group-hover:hover-effect" : "mb-[3px]",
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
            "ml-1 text-foreground group-hover:hover-effect",
            hasError && "text-destructive group-hover:hover-effect",
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
                "ml-1 cursor-pointer text-foreground hover:hover-effect",
                disabled && "text-muted-foreground",
              )}
            />
          </Tooltip>
        </TooltipProvider>
      )}
    </label>
  );
};
