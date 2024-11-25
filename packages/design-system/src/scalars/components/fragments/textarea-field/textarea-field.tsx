import React, { useId, useCallback, useEffect } from "react";
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

const textareaBaseStyles = cn(
  // Base styles
  "flex w-full rounded-md text-sm leading-normal",
  // Colors & Background
  "dark:border-charcoal-700 dark:bg-charcoal-900 border border-gray-300 bg-white",
  // Placeholder
  "font-sans placeholder:text-gray-600 dark:placeholder:text-gray-500",
  // Padding & Spacing
  "px-3 py-2",
  // Focus state
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-900 focus-visible:ring-offset-1 focus-visible:ring-offset-white",
  "dark:focus-visible:ring-charcoal-300 dark:focus-visible:ring-offset-charcoal-900",
  // Disabled state
  "disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-500",
);

const TextareaFieldRaw = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      autoComplete = false,
      autoExpand = false,
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
        lowercase: !!lowercase,
        trim: !!trim,
        uppercase: !!uppercase,
      });

      // Call the original onChange
      onChange?.(e);
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
                    "min-h-[120px] resize-y",
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
            rows={rows}
            onChange={handleChange}
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
