/* eslint-disable react/jsx-max-depth */
/* eslint-disable react/jsx-props-no-spreading */
import {
  cn,
  FormDescription,
  FormGroup,
  FormLabel,
  FormMessageList,
} from "#scalars";
import React, { useCallback, useId } from "react";
import { Button } from "../../../../scalars/components/fragments/button/index.js";
import { Command } from "../../../../scalars/components/fragments/command/index.js";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../../scalars/components/fragments/popover/index.js";
import { Content } from "./content.js";
import { SelectDiff } from "./select-diff.js";
import { SelectedContent } from "./selected-content.js";
import type { SelectProps } from "./types.js";
import { useSelect } from "./use-select.js";

const processValue = (
  currentValue: string | string[] | undefined,
  currentDefaultValue: string | string[] | undefined,
): string => {
  const displayValue = currentValue ?? currentDefaultValue ?? "";

  if (Array.isArray(displayValue)) {
    return displayValue.join(", ");
  }

  return displayValue;
};

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
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

      // diff props
      viewMode = "edition",
      diffMode,
      baseValue,

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
    } = useSelect({
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

    if (viewMode === "edition") {
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
    }

    return (
      <SelectDiff
        value={processValue(value, defaultValue)}
        label={label}
        required={required}
        viewMode={viewMode}
        diffMode={diffMode}
        baseValue={baseValue}
      />
    );
  },
);

Select.displayName = "Select";

export { Select };
