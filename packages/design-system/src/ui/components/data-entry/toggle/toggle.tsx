import { cn } from "#scalars";
import React, { useId } from "react";
import { FormLabel } from "../../../../scalars/components/fragments/form-label/index.js";
import { FormMessageList } from "../../../../scalars/components/fragments/form-message/index.js";
import {
  type InputBaseProps,
  type ViewMode,
  type WithDifference,
} from "../../../../scalars/components/types.js";
import ToggleDiff from "./subcomponents/toogle-diff.js";
import { ToggleBase } from "./toggle-base.js";

type ToggleBaseProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  keyof InputBaseProps<boolean> | "onChange"
>;

interface ToggleProps
  extends ToggleBaseProps,
    Omit<WithDifference<boolean>, "diffMode" | "viewMode">,
    InputBaseProps<boolean> {
  onChange?: (checked: boolean) => void;
  optionalLabel?: string;
  viewMode?: Extract<ViewMode, "edition" | "addition" | "removal">;
}

const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  (
    {
      id: idProp,
      name,
      label,
      disabled = false,
      value,
      onChange,
      errors = [],
      warnings = [],
      required = false,
      className,
      defaultValue,
      description,
      viewMode = "edition",
      optionalLabel,
      baseValue,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = idProp ?? generatedId;
    if (viewMode === "edition") {
      return (
        <div
          className={cn("flex flex-col gap-1", className)}
          data-testid="custom-class"
        >
          <div className="flex items-center">
            {optionalLabel && (
              <FormLabel
                className={cn("mr-2")}
                disabled={disabled}
                required={required}
                inline
                id={`${id}-optionalLabel`}
              >
                {optionalLabel}
              </FormLabel>
            )}
            <ToggleBase
              aria-labelledby={`${id}-label`}
              required={required}
              disabled={disabled}
              name={name}
              id={id}
              checked={value ?? defaultValue}
              onCheckedChange={onChange}
              ref={ref}
              {...props}
            />
            {label && (
              <FormLabel
                htmlFor={id}
                className={cn("ml-2")}
                disabled={disabled}
                required={required}
                description={description}
                inline
                id={`${id}-label`}
              >
                {label}
              </FormLabel>
            )}
          </div>
          {warnings.length !== 0 && (
            <FormMessageList messages={warnings} type="warning" />
          )}
          {errors.length !== 0 && (
            <FormMessageList messages={errors} type="error" />
          )}
        </div>
      );
    }
    return (
      <div
        className={cn("flex flex-col gap-1", className)}
        data-testid="custom-class"
      >
        {/* WIP */}
        <ToggleDiff
          viewMode={viewMode}
          baseValue={baseValue}
          value={value}
          label={label}
          optionalLabel={optionalLabel}
        />
      </div>
    );
  },
);

Toggle.displayName = "Toggle";

export { Toggle, type ToggleProps };
