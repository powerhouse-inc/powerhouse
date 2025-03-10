import { forwardRef, useId, useMemo } from "react";
import { Input } from "../input";
import { FormLabel } from "../form-label";
import { FormMessageList } from "../form-message";
import { FormGroup } from "../form-group";
import {
  type ErrorHandling,
  type FieldCommonProps,
  type TextProps,
} from "../../types";
import { FormDescription } from "../form-description";
import { CharacterCounter } from "../character-counter";
import { withFieldValidation } from "../with-field-validation";
import ValueTransformer, {
  type TransformerType,
} from "@/scalars/components/fragments/value-transformer";
import { sharedValueTransformers } from "@/scalars/lib/shared-value-transformers";
import { cn } from "@/scalars/lib/utils";

export interface TextFieldProps
  extends Omit<
    FieldCommonProps<string> &
      Omit<React.InputHTMLAttributes<HTMLInputElement>, "pattern"> &
      ErrorHandling &
      TextProps,
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
    const idGenerated = useId();
    const id = props.id ?? idGenerated;
    const autoCompleteValue =
      autoComplete === undefined ? undefined : autoComplete ? "on" : "off";
    const hasContentBelow =
      !!description ||
      (Array.isArray(warnings) && warnings.length > 0) ||
      (Array.isArray(errors) && errors.length > 0);

    const transformers: TransformerType = useMemo(
      () => [
        sharedValueTransformers.trimOnBlur(!!trim),
        sharedValueTransformers.lowercaseOnChange(!!lowercase),
        sharedValueTransformers.uppercaseOnChange(!!uppercase),
        sharedValueTransformers.trimOnEnter(!!trim),
      ],
      [trim, lowercase, uppercase],
    );

    return (
      <FormGroup>
        {label && (
          <FormLabel
            htmlFor={id}
            required={props.required}
            disabled={props.disabled}
            hasError={!!errors?.length}
          >
            {label}
          </FormLabel>
        )}
        <ValueTransformer transformers={transformers}>
          <Input
            id={id}
            value={value ?? ""}
            defaultValue={defaultValue}
            onChange={onChange}
            pattern={pattern?.toString()}
            autoComplete={autoCompleteValue}
            {...props}
            ref={ref}
          />
        </ValueTransformer>
        {typeof maxLength === "number" && maxLength > 0 && (
          <div
            className={cn(
              "mt-[-6px] flex justify-end",
              hasContentBelow && "-mb-1",
            )}
          >
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
