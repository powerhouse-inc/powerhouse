import { useId } from "react";
import { FormLabel } from "../form-label";
import { Checkbox } from "./checkbox";
import { cn } from "@/scalars/lib/utils";
import { FormMessageList } from "../form-message";

interface CheckboxFieldProps {
  id?: string;
  name?: string;
  label?: React.ReactNode;
  checked?: boolean;
  disabled?: boolean;
  required?: boolean;
  description?: string;
  errors?: string[];
  warnings?: string[];
  onChange?: (checked: boolean) => void;
  className?: string;
}

const CheckboxField: React.FC<CheckboxFieldProps> = ({
  id: idProp,
  name,
  label,
  checked,
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
      <div className={cn("flex items-center space-x-2 group", className)}>
        <Checkbox
          id={id}
          name={name}
          checked={checked}
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

export { CheckboxField };
