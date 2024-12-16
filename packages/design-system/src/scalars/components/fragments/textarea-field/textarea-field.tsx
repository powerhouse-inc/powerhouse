import React, { useId, useEffect, useMemo } from "react";
import { FormLabel } from "@/scalars/components/fragments/form-label";
import { FormMessageList } from "@/scalars/components/fragments/form-message";
import { FormGroup } from "@/scalars/components/fragments/form-group";
import { FormDescription } from "@/scalars/components/fragments/form-description";
import { CharacterCounter } from "@/scalars/components/fragments/character-counter";
import { withFieldValidation } from "@/scalars/components/fragments/with-field-validation";
import { cn } from "@/scalars/lib/utils";
import {
  FieldCommonProps,
  ErrorHandling,
  TextProps,
} from "@/scalars/components/types";
import ValueTransformer, {
  type TransformerType,
} from "@/scalars/components/fragments/value-transformer";
import { sharedValueTransformers } from "@/scalars/lib/shared-value-transformers";

type TextareaFieldBaseProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  keyof FieldCommonProps<string> | keyof ErrorHandling | keyof TextProps
>;

export interface TextareaProps
  extends TextareaFieldBaseProps,
    FieldCommonProps<string>,
    ErrorHandling,
    TextProps {
  autoExpand?: boolean;
  multiline?: boolean;
}

const textareaBaseStyles = cn(
  // Base styles
  "flex w-full min-h-9 rounded-md text-[14px] font-normal leading-5",
  // Colors & Background
  "dark:border-charcoal-700 dark:bg-charcoal-900 border border-gray-300 bg-white",
  // Placeholder
  "font-sans placeholder:text-gray-600 dark:placeholder:text-gray-500",
  // Padding & Spacing
  "px-3 py-[7.2px]",
  // Focus state
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-900 focus-visible:ring-offset-1 focus-visible:ring-offset-white",
  "dark:focus-visible:ring-charcoal-300 dark:focus-visible:ring-offset-charcoal-900",
  // Disabled state
  "disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-500",
);

const TextareaFieldRaw = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      autoComplete,
      autoExpand,
      multiline,
      className,
      defaultValue,
      description,
      errors,
      id: propId,
      label,
      lowercase,
      maxLength,
      minLength,
      name,
      onChange,
      placeholder,
      required,
      rows = 3,
      trim,
      uppercase,
      value,
      warnings,
      ...props
    },
    ref,
  ) => {
    const autoCompleteValue = autoComplete ? "on" : "off";
    const hasError = errors && errors.length > 0;

    const prefix = useId();
    const id = propId ?? `${prefix}-textarea`;

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Prevent Enter key if multiline is false
      if (multiline === false && e.key === "Enter") {
        e.preventDefault();
      }

      // Call the original onKeyDown
      props.onKeyDown?.(e);
    };

    useEffect(() => {
      const adjustHeight = () => {
        const textarea = document.getElementById(id);
        if (textarea) {
          // Reset height to allow shrinking
          textarea.style.height = "auto";
          // Set to scrollHeight to expand based on content
          textarea.style.height = `${textarea.scrollHeight}px`;
        }
      };
      if (value !== undefined && autoExpand) {
        adjustHeight();
      }
    }, [id, value, autoExpand]);

    const transformers: TransformerType = useMemo(
      () => [
        sharedValueTransformers.trimOnBlur(!!trim),
        sharedValueTransformers.lowercaseOnChange(!!lowercase),
        sharedValueTransformers.uppercaseOnChange(!!uppercase),
        {
          transformer: (value?: string) => value?.replace(/\n/g, ""),
          options: {
            trigger: "change",
            if: multiline === false,
          },
        },
      ],
      [trim, lowercase, uppercase, multiline],
    );

    return (
      <FormGroup>
        {label && (
          <FormLabel
            htmlFor={id}
            disabled={props.disabled}
            hasError={hasError}
            required={required}
          >
            {label}
          </FormLabel>
        )}
        <div className="relative">
          <ValueTransformer transformers={transformers}>
            <textarea
              aria-invalid={hasError}
              aria-required={required}
              autoComplete={autoCompleteValue}
              className={cn(
                textareaBaseStyles,

                // Resize behavior based on autoExpand
                autoExpand
                  ? "resize-none overflow-hidden"
                  : [
                      "resize-y",
                      "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-300",
                      "dark:scrollbar-track-gray-900 dark:scrollbar-thumb-gray-600",
                    ],

                className,
              )}
              ref={ref}
              id={id}
              name={name}
              value={value}
              defaultValue={defaultValue}
              minLength={minLength}
              placeholder={placeholder}
              rows={multiline === false ? 1 : rows}
              onChange={onChange}
              onKeyDown={handleKeyDown}
              {...props}
            />
          </ValueTransformer>
          {typeof maxLength === "number" && maxLength > 0 && (
            <div className="mt-0.5 flex justify-end">
              <CharacterCounter maxLength={maxLength} value={value ?? ""} />
            </div>
          )}
        </div>
        {description && <FormDescription>{description}</FormDescription>}
        {warnings && <FormMessageList messages={warnings} type="warning" />}
        {errors && <FormMessageList messages={errors} type="error" />}
      </FormGroup>
    );
  },
);

export const TextareaField = withFieldValidation<TextareaProps>(
  TextareaFieldRaw,
) as React.ForwardRefExoticComponent<
  TextareaProps & React.RefAttributes<HTMLTextAreaElement>
>;

TextareaField.displayName = "TextareaField";
