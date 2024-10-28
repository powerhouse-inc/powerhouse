import { useId } from "react";
import { FormLabel } from "../form-label";
import { Checkbox } from "./checkbox";
import { cn } from "@/scalars/lib/utils";

interface CheckboxFieldProps {
  id?: string;
  name?: string;
  label?: React.ReactNode;
  checked?: boolean;
  disabled?: boolean;
  required?: boolean;
  description?: string;
  // TODO: add support for errors and warnings
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
  onChange,
  className,
}) => {
  const generatedId = useId();
  const id = idProp ?? generatedId;

  return (
    <div className={cn("flex flex-col gap-2")}>
      <div className={cn("flex items-center space-x-2", className)}>
        <Checkbox
          id={id}
          name={name}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onChange}
          required={required}
        />
        <FormLabel htmlFor={id} required={required} description={description}>
          {label}
        </FormLabel>
      </div>
      {/* TODO: add support for errors and warnings */}
    </div>
  );
};

export { CheckboxField };
