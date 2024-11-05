import { forwardRef } from "react";
import { Input } from "../input";
import { FormLabel } from "../form-label";
import { FormMessageList } from "../form-message";
import { FormGroup } from "../form-group";
import { ErrorHandling, FieldCommonProps, TextProps } from "../../types";
import { FormDescription } from "../form-description";
import { applyTransformers } from "@/scalars/lib/transformers";
import { CharacterCounter } from "../character-counter";
import { withFieldValidation } from "../with-field-validation";

export interface TextFieldProps
  extends Omit<
    FieldCommonProps<string> &
      TextProps &
      ErrorHandling &
      React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "autoComplete"
  > {
  value?: string;
  autoComplete?: boolean;
}

const TextFieldRaw = forwardRef<HTMLInputElement, TextFieldProps>(
  (
    {
      label,
      description,
      value,
      defaultValue,
      onChange,
      errors,
      warnings,
      // TextProps
      pattern,
      trim,
      uppercase,
      lowercase,
      maxLength,
      autoComplete,
      ...props
    },
    ref,
  ) => {
    const transformedValue = applyTransformers(value, {
      trim: !!trim,
      uppercase: !!uppercase,
      lowercase: !!lowercase,
    });
    const autoCompleteValue =
      autoComplete === undefined ? undefined : autoComplete ? "on" : "off";

    return (
      <FormGroup>
        {label && (
          <FormLabel
            required={props.required}
            disabled={props.disabled}
            hasError={!!errors?.length}
          >
            {label}
          </FormLabel>
        )}
        <Input
          value={transformedValue}
          defaultValue={defaultValue ?? undefined}
          onChange={onChange}
          pattern={pattern?.toString()}
          autoComplete={autoCompleteValue}
          {...props}
          ref={ref}
        />
        {maxLength && (
          <div className="flex justify-end">
            <CharacterCounter maxLength={maxLength} value={value ?? ""} />
          </div>
        )}
        {description && <FormDescription>{description}</FormDescription>}
        {warnings && <FormMessageList messages={warnings} type="warning" />}
        {errors && <FormMessageList messages={errors} type="error" />}
      </FormGroup>
    );
  },
);

export const TextField = withFieldValidation<TextFieldProps>(TextFieldRaw);
