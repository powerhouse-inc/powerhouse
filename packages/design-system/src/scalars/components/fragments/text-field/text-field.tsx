import { cn, sharedValueTransformers, type TransformerType } from "#scalars";
import { forwardRef, useId, useMemo } from "react";
import {
  type ErrorHandling,
  type FieldCommonProps,
  type TextProps,
} from "../../types.js";
import { CharacterCounter } from "../character-counter/index.js";
import { FormDescription } from "../form-description/index.js";
import { FormGroup } from "../form-group/index.js";
import { FormLabel } from "../form-label/index.js";
import { FormMessageList } from "../form-message/index.js";
import { Input } from "../input/index.js";
import ValueTransformer from "../value-transformer/index.js";
import { withFieldValidation } from "../with-field-validation/index.js";

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
