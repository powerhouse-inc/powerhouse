import { cn, sharedValueTransformers } from "#scalars";
import React, { useEffect, useId, useMemo, useRef } from "react";
import { useResizeObserver } from "usehooks-ts";
import { CharacterCounter } from "../../../../scalars/components/fragments/character-counter/index.js";
import { FormDescription } from "../../../../scalars/components/fragments/form-description/index.js";
import { FormGroup } from "../../../../scalars/components/fragments/form-group/index.js";
import { FormLabel } from "../../../../scalars/components/fragments/form-label/index.js";
import { FormMessageList } from "../../../../scalars/components/fragments/form-message/index.js";
import ValueTransformer, {
  type TransformerType,
} from "../../../../scalars/components/fragments/value-transformer/index.js";
import type { InputBaseProps } from "../../../../scalars/components/types.js";
import type { CommonTextProps } from "../text-input/types.js";

type TextareaBaseProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  keyof InputBaseProps<string> | keyof CommonTextProps
>;

interface TextareaProps
  extends TextareaBaseProps,
    InputBaseProps<string>,
    CommonTextProps {
  autoExpand?: boolean;
  multiline?: boolean;
}

const textareaBaseStyles = cn(
  // Base styles
  "flex min-h-9 w-full rounded-md text-sm font-normal leading-5 text-gray-900 dark:text-gray-50",
  // Border & Background
  "dark:border-charcoal-700 dark:bg-charcoal-900 border border-gray-300 bg-white",
  // Padding
  "px-3 py-[7px]",
  // Placeholder
  "font-sans placeholder:text-gray-500 dark:placeholder:text-gray-600",
  // Focus styles
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-900 focus-visible:ring-offset-0 focus-visible:ring-offset-white",
  "dark:focus-visible:ring-charcoal-300 dark:focus-visible:ring-offset-charcoal-900 dark:focus:bg-charcoal-900 focus:bg-gray-50",
  // Disabled state
  "disabled:cursor-not-allowed",
  "disabled:border-gray-300 disabled:bg-gray-50 disabled:text-gray-700",
  "disabled:dark:border-charcoal-800 disabled:dark:bg-charcoal-900 disabled:dark:text-gray-300",
);

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      autoComplete,
      autoExpand,
      multiline = true,
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
    const autoCompleteValue =
      autoComplete === undefined ? undefined : autoComplete ? "on" : "off";
    const hasError = errors && errors.length > 0;
    const hasContentBelow =
      !!description ||
      (Array.isArray(warnings) && warnings.length > 0) ||
      (Array.isArray(errors) && errors.length > 0);

    const prefix = useId();
    const id = propId ?? `${prefix}-textarea`;

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const mergedRef = (node: HTMLTextAreaElement | null) => {
      textareaRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    };

    const adjustHeight = () => {
      if (textareaRef.current) {
        // Reset height to allow shrinking
        textareaRef.current.style.height = "auto";
        // Set to scrollHeight to expand based on content
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    };

    useResizeObserver({
      ref: textareaRef,
      onResize: () => {
        if (value !== undefined && autoExpand) {
          adjustHeight();
        }
      },
      box: "border-box",
    });

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Prevent Enter key if multiline is falsy
      if (!multiline && e.key === "Enter") {
        e.preventDefault();
      }
      // Call the original onKeyDown
      props.onKeyDown?.(e);
    };

    useEffect(() => {
      if (value !== undefined && autoExpand) {
        adjustHeight();
      }
    }, [value, autoExpand]);

    const transformers: TransformerType = useMemo(
      () => [
        sharedValueTransformers.trimOnBlur(!!trim),
        sharedValueTransformers.lowercaseOnChange(!!lowercase),
        sharedValueTransformers.uppercaseOnChange(!!uppercase),
        {
          transformer: (value?: string) => value?.replace(/\n/g, ""),
          options: {
            trigger: "change",
            if: !multiline,
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
                      "scrollbar-thin scrollbar-gutter-stable",
                      "scrollbar-track-transparent",
                      "scrollbar-thumb-gray-300 hover:scrollbar-thumb-gray-300",
                      "dark:scrollbar-thumb-charcoal-700 dark:hover:scrollbar-thumb-charcoal-700",
                      "scrollbar-thumb-rounded-md",
                    ],
                className,
              )}
              ref={mergedRef}
              id={id}
              name={name}
              value={value}
              defaultValue={defaultValue}
              minLength={minLength}
              placeholder={placeholder}
              rows={multiline ? rows : 1}
              onChange={onChange}
              onKeyDown={handleKeyDown}
              {...props}
            />
          </ValueTransformer>
          {typeof maxLength === "number" && maxLength > 0 && (
            <div
              className={cn(
                "mt-0.5 flex justify-end",
                hasContentBelow && "-mb-1",
              )}
            >
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

Textarea.displayName = "Textarea";

export { Textarea, type TextareaProps };
