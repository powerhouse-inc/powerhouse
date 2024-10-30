import { forwardRef } from "react";
import { Input, InputProps } from "../input";
import { FormLabel } from "../form-label";
import { FormMessageList } from "../form-message";
import { FormGroup } from "../form-group";
import { FieldCommonProps } from "../types";

export interface StringProps
  extends FieldCommonProps<string>,
    Omit<InputProps, "value"> {}

export const StringField = forwardRef<HTMLInputElement, StringProps>(
  (
    {
      label,
      description,
      value,
      default: defaultValue,
      errors,
      warnings,
      ...props
    },
    ref,
  ) => {
    return (
      <FormGroup>
        {label && (
          <FormLabel
            required={props.required}
            description={description}
            hasError={!!errors?.length}
          >
            {label}
          </FormLabel>
        )}
        <Input
          value={value ?? undefined}
          defaultValue={defaultValue ?? undefined}
          {...props}
          ref={ref}
        />
        {warnings && <FormMessageList messages={warnings} type="warning" />}
        {errors && <FormMessageList messages={errors} type="error" />}
      </FormGroup>
    );
  },
);
