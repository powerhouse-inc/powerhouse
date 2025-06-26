import { forwardRef, useId, useMemo } from "react";
import { cn } from "../../lib/index.js";
import { sharedValueTransformers } from "../../lib/shared-value-transformers.js";
import type { DiffMode, InputBaseProps, WithDifference } from "../../types.js";
import { CharacterCounter } from "../character-counter/index.js";
import { FormDescription } from "../form-description/index.js";
import { FormGroup } from "../form-group/form-group.js";
import { FormLabel } from "../form-label/form-label.js";
import { FormMessageList } from "../form-message/message-list.js";
import { Input } from "../input/index.js";
import ValueTransformer, {
  type TransformerType,
} from "../value-transformer/value-transformer.js";
import TextInputDiff from "./text-input-diff.js";
import type { CommonTextProps } from "./types.js";

interface TextInputProps
  extends Omit<
      InputBaseProps<string> &
        Omit<React.InputHTMLAttributes<HTMLInputElement>, "pattern"> &
        CommonTextProps,
      "value" | "autoComplete"
    >,
    Omit<WithDifference<string>, "diffMode"> {
  value?: string;
  autoComplete?: boolean;
  diffMode?: Extract<DiffMode, "sentences">;
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
      // Difference Props
      baseValue,
      viewMode = "edition",
      diffMode,
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

    if (viewMode === "edition") {
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
    }

    // Diff mode
    return (
      <TextInputDiff
        value={value ?? defaultValue ?? ""}
        viewMode={viewMode}
        diffMode={diffMode}
        baseValue={baseValue}
        label={label}
        required={props.required}
      />
    );
  },
);

TextInput.displayName = "TextInput";

export { TextInput, type TextInputProps };
