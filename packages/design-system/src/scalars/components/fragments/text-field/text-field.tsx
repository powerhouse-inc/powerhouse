import { forwardRef } from "react";
import { Input } from "../input";
import { FormLabel } from "../form-label";
import { FormMessageList } from "../form-message";
import { FormGroup } from "../form-group";
import { ErrorHandling, FieldCommonProps, TextProps } from "../../types";
import { FormDescription } from "../form-description";

export interface TextFieldProps
  extends Omit<
    FieldCommonProps<string> &
      TextProps &
      ErrorHandling &
      React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "autoComplete"
  > {
  value?: string;
  autoComplete?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  (
    {
      label,
      description,
      value,
      defaultValue,
      errors,
      warnings,
      // TextProps
      pattern,
      // TODO: Implement the following props
      // trim,
      // uppercase,
      // lowercase,
      ...props
    },
    ref,
  ) => {
    return (
      <FormGroup>
        {label && (
          <FormLabel required={props.required} hasError={!!errors?.length}>
            {label}
          </FormLabel>
        )}
        <Input
          value={value ?? undefined}
          defaultValue={defaultValue ?? undefined}
          pattern={pattern?.toString()}
          {...props}
          ref={ref}
        />
        {description && <FormDescription>{description}</FormDescription>}
        {warnings && <FormMessageList messages={warnings} type="warning" />}
        {errors && <FormMessageList messages={errors} type="error" />}
      </FormGroup>
    );
  },
);
