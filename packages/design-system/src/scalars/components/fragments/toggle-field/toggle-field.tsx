import { cn } from "#scalars";

import { useId } from "react";
import type { FieldCommonProps } from "../../types.js";
import { FormLabel } from "../form-label/index.js";
import { FormMessageList } from "../form-message/index.js";
import { withFieldValidation } from "../with-field-validation/index.js";
import { Toggle } from "./toggle.js";

export interface ToggleFieldProps extends FieldCommonProps<boolean> {
  onChange?: (checked: boolean) => void;
}

const ToggleRaw: React.FC<ToggleFieldProps> = ({
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
}) => {
  const generatedId = useId();
  const id = idProp ?? generatedId;

  return (
    <div
      className={cn("flex flex-col gap-1", className)}
      data-testid="custom-class"
    >
      <div className="flex items-center">
        <Toggle
          aria-labelledby={`${id}-label`}
          required={required}
          disabled={disabled}
          name={name}
          id={id}
          checked={value ?? defaultValue}
          onCheckedChange={onChange}
        />
        {label && (
          <FormLabel
            htmlFor={id}
            className="ml-2"
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
};

const ToggleField = withFieldValidation<ToggleFieldProps>(ToggleRaw);

export { ToggleField };
