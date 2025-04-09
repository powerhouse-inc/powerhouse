import { cn, FormMessageList } from "#scalars";
import { forwardRef, useId, useMemo } from "react";
import { CharacterCounter } from "../../../../scalars/components/fragments/character-counter/index.js";
import { FormDescription } from "../../../../scalars/components/fragments/form-description/index.js";
import { FormGroup } from "../../../../scalars/components/fragments/form-group/form-group.js";
import { FormLabel } from "../../../../scalars/components/fragments/form-label/form-label.js";
import ValueTransformer, {
  type TransformerType,
} from "../../../../scalars/components/fragments/value-transformer/value-transformer.js";
import type { InputBaseProps } from "../../../../scalars/components/types.js";
import { sharedValueTransformers } from "../../../../scalars/lib/shared-value-transformers.js";
import { Input } from "../input/index.js";
import type { CommonTextProps } from "./types.js";

interface TextInputProps
  extends Omit<
    InputBaseProps<string> &
      Omit<React.InputHTMLAttributes<HTMLInputElement>, "pattern"> &
      CommonTextProps,
    "value" | "autoComplete"
  > {
  value?: string;
  autoComplete?: boolean;
}

const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
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
            value={value ?? defaultValue ?? ""}
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

TextInput.displayName = "TextInput";

export { TextInput, type TextInputProps };
