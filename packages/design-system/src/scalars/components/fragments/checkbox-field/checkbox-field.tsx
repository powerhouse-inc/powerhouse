import { useId } from "react";
import { FormLabel } from "../form-label";
import { Checkbox, type CheckboxValue } from "./checkbox";
import { cn } from "@/scalars/lib/utils";
import { FormMessageList } from "../form-message";
import { type FieldCommonProps } from "../../types";
import { withFieldValidation } from "../with-field-validation";

export interface CheckboxFieldProps extends FieldCommonProps<CheckboxValue> {
  onChange?: (checked: CheckboxValue) => void;
}

const CheckboxRaw: React.FC<CheckboxFieldProps> = ({
  id: idProp,
  name,
  label,
  value,
  defaultValue,
  disabled,
  required,
  description,
  errors,
  warnings,
  onChange,
  className,
  ...props
}) => {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const hasError = !!errors?.length;

  const castValue = (value: unknown) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  };

  return (
    <div className={cn("flex flex-col gap-2")}>
      <div className={cn("group flex items-center space-x-2", className)}>
        <Checkbox
          id={id}
          name={name}
          checked={castValue(value ?? defaultValue) as CheckboxValue}
          disabled={disabled}
          onCheckedChange={onChange}
          required={required}
          invalid={hasError}
          aria-invalid={hasError}
          {...props}
        />
        <FormLabel
          htmlFor={id}
          required={required}
          disabled={disabled}
          hasError={hasError}
          description={description}
          className={cn(!disabled && "group-hover:cursor-pointer")}
          inline
        >
          {label}
        </FormLabel>
      </div>
      {warnings && <FormMessageList type="warning" messages={warnings} />}
      {errors && <FormMessageList type="error" messages={errors} />}
    </div>
  );
};

const CheckboxField = withFieldValidation<CheckboxFieldProps>(CheckboxRaw);

CheckboxField.displayName = "CheckboxField";

export { CheckboxField };
