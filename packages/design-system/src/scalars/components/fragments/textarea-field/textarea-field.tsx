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
  FieldCommonProps,
  ErrorHandling,
  TextProps,
} from "@/scalars/components/types";

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
      value: propValue,
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

    const value =
      propValue !== undefined
        ? applyTransformers(propValue, { lowercase, trim, uppercase })
        : propValue;

    const adjustHeight = (element: HTMLTextAreaElement) => {
      if (autoExpand) {
        // Reset height to allow shrinking
        element.style.height = "auto";
        // Set to scrollHeight to expand based on content
        element.style.height = `${element.scrollHeight}px`;
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (autoExpand) {
        adjustHeight(e.currentTarget);
      }

      // Transform and directly modify the value before sending it through onChange
      e.target.value = applyTransformers(e.target.value, {
        lowercase,
        trim,
        uppercase,
      });

      // Call the original onChange
      onChange?.(e);
    };

    // Initial transformation if needed
    useEffect(() => {
      if (propValue !== undefined) {
        const transformedValue = applyTransformers(propValue, {
          lowercase,
          trim,
          uppercase,
        });

        if (transformedValue !== propValue) {
          const e = new Event("change", {
            bubbles: true,
          }) as unknown as React.ChangeEvent<HTMLTextAreaElement>;
          Object.defineProperty(e, "target", {
            value: { value: transformedValue },
          });
          Object.defineProperty(e, "currentTarget", {
            value: { value: transformedValue },
          });

          onChange?.(e);
        }
      }
    }, []);

    useEffect(() => {
      const textareaRef = ref && (ref as React.RefObject<HTMLTextAreaElement>);
      if (textareaRef?.current && autoExpand) {
        adjustHeight(textareaRef.current);
      }
    }, [value, autoExpand]);

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
              "font-sans font-normal",

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
                "border-orange-500 bg-orange-50/50",
                "dark:border-orange-400 dark:bg-orange-900/5",
                "hover:border-orange-600",
                "dark:hover:border-orange-300",
                "focus:ring-0 focus:ring-offset-0",
                "focus:border-orange-500",
                "dark:focus:border-orange-400",
              ],

              // Error states
              hasError && [
                "border-red-500 bg-red-50/50",
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
                    "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-300",
                    "dark:scrollbar-track-gray-900 dark:scrollbar-thumb-gray-600",
                  ],

              className,
            )}
            defaultValue={defaultValue}
            disabled={disabled}
            id={id}
            minLength={minLength}
            name={name}
            placeholder={placeholder}
            rows={rows}
            spellCheck={spellCheck}
            value={value}
            onChange={handleChange}
            {...props}
            ref={ref}
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

export const TextareaField = withFieldValidation<TextareaProps>(
  TextareaFieldRaw,
) as React.ForwardRefExoticComponent<
  TextareaProps & React.RefAttributes<HTMLTextAreaElement>
>;

TextareaField.displayName = "TextareaField";
