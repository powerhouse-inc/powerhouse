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
  multiline?: boolean;
}

const textareaBaseStyles = cn(
  // Base styles
  "flex w-full rounded-md text-[14px] font-normal leading-5",
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
      value: propValue,
      warnings,
      ...props
    },
    ref,
  ) => {
    const autoCompleteValue = autoComplete ? "on" : "off";
    const hasError = errors && errors.length > 0;

    const prefix = useId();
    const id = propId ?? `${prefix}-textarea`;

    const value =
      propValue !== undefined
        ? applyTransformers(propValue, {
            lowercase: !!lowercase,
            trim: !!trim,
            uppercase: !!uppercase,
          })
        : propValue;

    const adjustHeight = () => {
      const textarea = document.getElementById(id);
      if (textarea) {
        // Reset height to allow shrinking
        textarea.style.height = "auto";
        // Set to scrollHeight to expand based on content
        textarea.style.height = `${textarea.scrollHeight}px`;
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      // Prevent line breaks if multiline is false
      let newValue = e.target.value;
      if (multiline === false) {
        newValue = newValue.replace(/\n/g, "");
      }

      // Transform and directly modify the value
      newValue = applyTransformers(newValue, {
        lowercase: !!lowercase,
        trim: !!trim,
        uppercase: !!uppercase,
      });

      // Update the textarea value
      e.target.value = newValue;

      // Call the original onChange
      onChange?.(e);

      // Adjust height after processing the value
      if (autoExpand) {
        adjustHeight();
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Prevent Enter key if multiline is false
      if (multiline === false && e.key === "Enter") {
        e.preventDefault();
      }

      // Call the original onKeyDown
      props.onKeyDown?.(e);
    };

    // Initial transformation if needed
    useEffect(() => {
      if (propValue !== undefined) {
        const transformedValue = applyTransformers(propValue, {
          lowercase: !!lowercase,
          trim: !!trim,
          uppercase: !!uppercase,
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

        if (autoExpand) {
          adjustHeight();
        }
      }
    }, []);

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
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            {...props}
          />
          {maxLength && (
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
