import type {
  FieldErrorHandling,
  InputBaseProps,
} from "@powerhousedao/design-system/ui";
import type {
  SelectOption,
  SelectProps,
} from "@powerhousedao/design-system/ui";
import {
  Button,
  cn,
  Command,
  FormDescription,
  FormGroup,
  FormLabel,
  FormMessageList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  withFieldValidation,
} from "@powerhousedao/design-system/ui";
import React, { useCallback, useId } from "react";
import { Content } from "./content.js";
import { SelectedContent } from "./selected-content.js";
import { useSelectField } from "./use-select-field.js";

type SelectFieldBaseProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  | keyof InputBaseProps<string | string[]>
  | keyof FieldErrorHandling
  | keyof SelectProps
>;

export type SelectFieldProps = SelectFieldBaseProps &
  InputBaseProps<string | string[]> &
  FieldErrorHandling & {
    options?: SelectOption[];
    favoriteOptions?: SelectOption[];
  } & Omit<SelectProps, "options" | "favoriteOptions">;

export const SelectFieldRaw = React.forwardRef<
  HTMLButtonElement,
  SelectFieldProps
>(
  (
    {
      // core functionality props
      options = [],
      favoriteOptions = [],
      defaultValue,
      value,
      onChange,
      onBlur,

      // form-related props
      id: propId,
      name,
      label,
      required,
      disabled,

      // validation props
      errors = [],
      warnings = [],

      // behavior props
      multiple,
      selectionIcon = "auto",
      selectionIconPosition = "left",
      searchable,

      // display props
      description,
      placeholder,
      className,
      contentClassName,
      contentAlign = "start",

      ...props
    },
    ref,
  ) => {
    const prefix = useId();
    const id = propId ?? `${prefix}-select`;

    const {
      selectedValues,
      isPopoverOpen,
      commandListRef,
      toggleOption,
      handleClear,
      toggleAll,
      handleOpenChange,
    } = useSelectField({
      options,
      multiple,
      defaultValue,
      value,
      onChange,
    });

    const onTriggerBlur = useCallback(
      (e: React.FocusEvent<HTMLButtonElement>) => {
        if (!isPopoverOpen) {
          // trigger the blur event when the trigger loses focus but the popover is not open,
          // because when the popover is open, the trigger loses focus but the select as a component still has the focus
          onBlur?.(e);
        }
      },
      [onBlur, isPopoverOpen],
    );

    return (
      <FormGroup>
        {label && (
          <FormLabel
            htmlFor={id}
            required={required}
            disabled={disabled}
            hasError={errors.length > 0}
            inline={false}
            onClick={(e) => {
              e.preventDefault();
              (e.target as HTMLLabelElement).control?.focus();
            }}
          >
            {label}
          </FormLabel>
        )}
        <Popover
          open={isPopoverOpen}
          onOpenChange={(open) => {
            handleOpenChange(open);
            // if the popover is closing and it was not by the trigger button
            if (!open && document.activeElement?.id !== id) {
              onBlur?.({ target: {} } as React.FocusEvent<HTMLButtonElement>);
            }
          }}
        >
          <PopoverTrigger asChild={true}>
            {/* TODO: create a trigger component */}
            <Button
              id={id}
              name={name}
              type="button"
              role="combobox"
              onBlur={onTriggerBlur}
              disabled={disabled}
              aria-invalid={errors.length > 0}
              aria-label={
                label ? undefined : multiple ? "Multi select" : "Select"
              }
              aria-required={required}
              aria-expanded={isPopoverOpen}
              className={cn(
                "flex h-9 w-full items-center justify-between px-3 py-2",
                "dark:border-charcoal-700 dark:bg-charcoal-900 rounded-md border border-gray-300 bg-white",
                "hover:border-gray-300 hover:bg-gray-100",
                "dark:hover:border-charcoal-700 dark:hover:bg-charcoal-800",
                "dark:focus:ring-charcoal-300 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:ring-offset-0",
                "dark:focus-visible:ring-charcoal-300 focus-visible:ring-1 focus-visible:ring-gray-900 focus-visible:ring-offset-0",
                disabled && [
                  "!pointer-events-auto cursor-not-allowed bg-gray-50",
                  "dark:hover:border-charcoal-700 dark:hover:bg-charcoal-900 hover:border-gray-300 hover:bg-gray-50",
                ],
                className,
              )}
              {...props}
              ref={ref}
            >
              <SelectedContent
                selectedValues={selectedValues}
                options={[...favoriteOptions, ...options]}
                multiple={multiple}
                searchable={searchable}
                placeholder={placeholder}
                handleClear={handleClear}
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align={contentAlign}
            onEscapeKeyDown={(e) => {
              e.preventDefault();
              handleOpenChange(false);
            }}
            className={contentClassName}
          >
            <Command
              defaultValue={
                !multiple && selectedValues[0]
                  ? options.find((opt) => opt.value === selectedValues[0])
                      ?.label
                  : undefined
              }
            >
              <Content
                favoriteOptions={favoriteOptions}
                searchable={searchable}
                commandListRef={commandListRef}
                multiple={multiple}
                selectedValues={selectedValues}
                selectionIcon={selectionIcon}
                selectionIconPosition={selectionIconPosition}
                options={options}
                toggleAll={toggleAll}
                toggleOption={toggleOption}
              />
            </Command>
          </PopoverContent>
        </Popover>
        {description && <FormDescription>{description}</FormDescription>}
        {warnings.length > 0 && (
          <FormMessageList messages={warnings} type="warning" />
        )}
        {errors.length > 0 && (
          <FormMessageList messages={errors} type="error" />
        )}
      </FormGroup>
    );
  },
);

export const SelectField =
  withFieldValidation<SelectFieldProps>(SelectFieldRaw);

SelectField.displayName = "SelectField";
