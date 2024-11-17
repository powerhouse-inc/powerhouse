import React, { useId, useEffect } from "react";
import { FormLabel } from "@/scalars/components/fragments/form-label";
import { FormMessageList } from "@/scalars/components/fragments/form-message";
import { FormGroup } from "@/scalars/components/fragments/form-group";
import { FormDescription } from "@/scalars/components/fragments/form-description";
import { CharacterCounter } from "@/scalars/components/fragments/character-counter";
import { withFieldValidation } from "@/scalars/components/fragments/with-field-validation";
import { applyTransformers } from "@/scalars/lib/transformers";
import { cn } from "@/scalars/lib/utils";
import {
  ErrorHandling,
  FieldCommonProps,
  TextProps,
} from "@/scalars/components/types";

type TextareaBaseProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  keyof FieldCommonProps<string> | keyof TextProps | keyof ErrorHandling
>;

export interface TextareaProps
  extends TextareaBaseProps,
    FieldCommonProps<string>,
    TextProps,
    ErrorHandling {
  autoExpand?: boolean;
}

const TextareaFieldRaw = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      autoComplete = false,
      autoExpand = false,
      className,
      defaultValue,
      description,
      disabled = false,
      errors = [],
      id: propId,
      label,
      lowercase = false,
      maxLength,
      minLength,
      name,
      onChange,
      placeholder,
      required = false,
      rows = 3,
      spellCheck = false,
      trim = false,
      uppercase = false,
      value,
      warnings = [],
      ...props
    },
    ref,
  ) => {
    const autoCompleteValue = autoComplete ? "on" : "off";
    const hasMaxLength = typeof maxLength === "number" && maxLength > 0;
    const hasWarning = warnings.length > 0;
    const hasError = errors.length > 0;

    const prefix = useId();
    const id = propId ?? `${prefix}-textarea`;

    const transformedValue = applyTransformers(value, {
      lowercase,
      trim,
      uppercase,
    });

    const adjustHeight = (element: HTMLTextAreaElement) => {
      if (autoExpand) {
        // Reset height to allow shrinking
        element.style.height = "auto";
        // Set to scrollHeight to expand based on content
        element.style.height = `${element.scrollHeight}px`;
      }
    };

    useEffect(() => {
      const textareaRef = ref && (ref as React.RefObject<HTMLTextAreaElement>);
      if (textareaRef?.current && autoExpand) {
        adjustHeight(textareaRef.current);
      }
    }, [value, autoExpand]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (autoExpand) {
        adjustHeight(e.currentTarget);
      }
      // Preserve existing onChange handler
      onChange?.(e);
    };

    return (
      <FormGroup>
        {label && (
          <FormLabel
            className="mb-1.5 font-normal"
            disabled={disabled}
            hasError={hasError}
            htmlFor={id}
            required={required}
          >
            {label}
          </FormLabel>
        )}
        <div className="relative">
          <textarea
            aria-invalid={hasError}
            aria-label={label ? undefined : "Text area"}
            aria-required={required}
            autoComplete={autoCompleteValue}
            className={cn(
              // Base styles
              "flex w-full rounded-lg text-base leading-normal",
              "font-inter font-normal",

              // Colors & Background
              "bg-white text-gray-900",
              "dark:bg-gray-900 dark:text-gray-100",

              // Border styles - Default state
              "border border-gray-300",
              "dark:border-gray-700",

              // Placeholder
              "placeholder:text-gray-500",
              "dark:placeholder:text-gray-600",

              // Padding & Spacing
              "px-4 py-3",

              // Focus state
              "focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2",
              "dark:focus:border-gray-700 dark:focus:bg-gray-900 dark:focus:ring-2 dark:focus:ring-gray-700 dark:focus:ring-offset-0",

              // Hover state
              "hover:border-gray-400",
              "dark:hover:border-gray-600",

              // Disabled state
              "disabled:cursor-not-allowed",
              "disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-500",
              "dark:disabled:border-gray-800 dark:disabled:bg-gray-900/50 dark:disabled:text-gray-600",

              // Warning states
              hasWarning && [
                "bg-orange-50/50 border-orange-500",
                "dark:border-orange-400 dark:bg-orange-900/5",
                "hover:border-orange-600",
                "dark:hover:border-orange-300",
                "focus:ring-0 focus:ring-offset-0",
                "focus:border-orange-500",
                "dark:focus:border-orange-400",
              ],

              // Error states
              hasError && [
                "bg-red-50/50 border-red-500",
                "dark:border-red-400 dark:bg-red-900/5",
                "hover:border-red-600",
                "dark:hover:border-red-300",
                "focus:ring-0 focus:ring-offset-0",
                "focus:border-red-500",
                "dark:focus:border-red-400",
              ],

              // Resize behavior based on autoExpand
              autoExpand
                ? "resize-none overflow-hidden"
                : [
                    "min-h-[120px] resize-y",
                    "scrollbar scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent",
                    "dark:scrollbar-thumb-gray-600",
                  ],

              className,
            )}
            defaultValue={defaultValue}
            disabled={disabled}
            id={id}
            minLength={minLength}
            name={name}
            placeholder={placeholder}
            ref={ref}
            rows={rows}
            spellCheck={spellCheck}
            {...props}
            value={transformedValue}
            onChange={handleChange}
          />
          {hasMaxLength && (
            <div className="mt-1.5 flex justify-end">
              <CharacterCounter maxLength={maxLength} value={value ?? ""} />
            </div>
          )}
        </div>
        {description && (
          <FormDescription
            className={cn(
              "mt-1.5",
              hasMaxLength && "mt-0",
              "dark:text-gray-400",
            )}
          >
            {description}
          </FormDescription>
        )}
        {hasWarning && (
          <FormMessageList
            className={cn("mt-1.5", hasMaxLength && "mt-0")}
            messages={warnings}
            type="warning"
          />
        )}
        {hasError && (
          <FormMessageList
            className={cn("mt-1.5", hasMaxLength && "mt-0")}
            messages={errors}
            type="error"
          />
        )}
      </FormGroup>
    );
  },
);

export const TextareaField =
  withFieldValidation<TextareaProps>(TextareaFieldRaw);
