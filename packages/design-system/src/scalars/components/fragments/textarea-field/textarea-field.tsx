import React, { useId, useEffect } from "react";
import { FormLabel } from "@/scalars/components/fragments/form-label";
import { FormMessageList } from "@/scalars/components/fragments/form-message";
import { FormGroup } from "@/scalars/components/fragments/form-group";
import { FormDescription } from "@/scalars/components/fragments/form-description";
import { applyTransformers } from "@/scalars/lib/transformers";
import { CharacterCounter } from "@/scalars/components/fragments/character-counter";
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

export const TextareaField = React.forwardRef<
  HTMLTextAreaElement,
  TextareaProps
>(
  (
    {
      autoComplete = false,
      autoExpand = false,
      className,
      customValidator,
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
      pattern,
      placeholder,
      required = false,
      rows = 3,
      showErrorOnBlur = false,
      showErrorOnChange = false,
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
            className="mb-1.5 font-normal text-gray-900"
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
              "flex w-full rounded-lg text-base leading-normal transition-all duration-200",
              "font-normal font-sans",

              // Colors & Background
              "text-gray-900 bg-white",
              "dark:text-gray-100 dark:bg-gray-900",

              // Border styles
              "border border-gray-200",
              "dark:border-gray-800",

              // Placeholder
              "placeholder:text-gray-500",
              "dark:placeholder:text-gray-600",

              // Padding & Spacing
              "px-4 py-3",

              // Focus state
              "focus:border-gray-900 focus:outline-none",
              "focus:ring-2 focus:ring-gray-100 focus:ring-offset-0",
              "dark:focus:border-gray-400 dark:focus:ring-gray-900/30",

              // Hover state
              "hover:border-gray-300",
              "dark:hover:border-gray-700",

              // Focus + Hover combined state
              "focus:hover:border-gray-900 focus:hover:ring-gray-200",
              "dark:focus:hover:border-gray-400 dark:focus:hover:ring-gray-900/40",

              // Active state
              "active:border-gray-400",
              "dark:active:border-gray-600",

              // Disabled state
              "disabled:cursor-not-allowed",
              "disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-400",
              "dark:disabled:border-gray-800 dark:disabled:bg-gray-900/50 dark:disabled:text-gray-600",

              // Error states
              hasError && [
                // Base error
                "border-red-700 bg-red-50/50",
                "dark:border-red-400 dark:bg-red-900/5",

                // Error hover
                "hover:border-red-800",
                "dark:hover:border-red-300",

                // Error focus
                "focus:border-red-900 focus:ring-red-100",
                "dark:focus:border-red-300 dark:focus:ring-red-900/30",

                // Error focus + hover
                "focus:hover:border-red-900 focus:hover:ring-red-200",
                "dark:focus:hover:border-red-300 dark:focus:hover:ring-red-900/40",
              ],

              // Resize behavior
              autoExpand && "resize-none overflow-hidden",
              !autoExpand && [
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
            onChange={handleChange}
            placeholder={placeholder}
            ref={ref}
            rows={rows}
            spellCheck={spellCheck}
            value={transformedValue}
            {...props}
          />
          {maxLength && (
            <div className="mt-1.5 flex justify-end">
              <CharacterCounter maxLength={maxLength} value={value ?? ""} />
            </div>
          )}
        </div>
        {description && (
          <FormDescription className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
            {description}
          </FormDescription>
        )}
        {warnings.length > 0 && (
          <FormMessageList
            className="mt-1.5"
            messages={warnings}
            type="warning"
          />
        )}
        {hasError && (
          <FormMessageList className="mt-1.5" messages={errors} type="error" />
        )}
      </FormGroup>
    );
  },
);
