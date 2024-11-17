import { useId } from "react";
import { FormLabel } from "../form-label";
import { Checkbox } from "./checkbox";
import { cn } from "@/scalars/lib/utils";
import { FormMessageList } from "../form-message";
import { FieldCommonProps } from "../../types";
import { withFieldValidation } from "../with-field-validation";

export interface CheckboxFieldProps extends FieldCommonProps<boolean> {
  onChange?: (checked: boolean) => void;
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
}) => {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const hasError = !!errors?.length;

  return (
    <div className={cn("flex flex-col gap-2")}>
      <div className={cn("group flex items-center space-x-2", className)}>
        <Checkbox
          id={id}
          name={name}
          checked={value ?? defaultValue}
          disabled={disabled}
          onCheckedChange={onChange}
          required={required}
          invalid={hasError}
          aria-invalid={hasError}
        />
        <FormLabel
          htmlFor={id}
          required={required}
          disabled={disabled}
          hasError={hasError}
          description={description}
          className={cn(!disabled && "group-hover:cursor-pointer")}
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

export { CheckboxField };
