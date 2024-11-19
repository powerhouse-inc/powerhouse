import React, { useId } from "react";
import { Button } from "@/scalars/components/fragments/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/scalars/components/fragments/popover";
import { FormGroup } from "@/scalars/components/fragments/form-group";
import { FormLabel } from "@/scalars/components/fragments/form-label";
import { FormDescription } from "@/scalars/components/fragments/form-description";
import { FormMessageList } from "@/scalars/components/fragments/form-message";
import { withFieldValidation } from "@/scalars/components/fragments/with-field-validation";
import { cn } from "@/scalars/lib/utils";
import {
  FieldCommonProps,
  ErrorHandling,
  SelectProps,
} from "@/scalars/components/types";
import { useSelectField } from "./use-select-field";
import { SelectedContent } from "./selected-content";
import { Content } from "./content";

type SelectFieldBaseProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  | keyof FieldCommonProps<string | string[]>
  | keyof ErrorHandling
  | keyof SelectProps
>;

export interface SelectFieldProps
  extends SelectFieldBaseProps,
    FieldCommonProps<string | string[]>,
    ErrorHandling,
    SelectProps {}

const SelectFieldRaw = React.forwardRef<HTMLButtonElement, SelectFieldProps>(
  (
    {
      // core functionality props
      options = [],
      multiple = false,
      defaultValue,
      value,
      onChange,

      // form-related props
      autoFocus = false,
      id: propId,
      name,
      label,
      required = false,
      disabled = false,

      // validation props
      errors = [],
      warnings = [],

      // behavior props
      asChild = false,
      asModal = false,
      searchable = false,

      // display props
      description,
      maxSelectedOptionsToShow = 3,
      placeholder = multiple ? "Select options" : "Select an option",
      className,

      ...props
    },
    ref,
  ) => {
    const prefix = useId();
    const id = propId ?? `${prefix}-select`;

    const {
      selectedValues,
      isPopoverOpen,
      setIsPopoverOpen,
      toggleOption,
      handleClear,
      toggleAll,
      handleTogglePopover,
      clearExtraOptions,
    } = useSelectField({
      options,
      multiple,
      maxSelectedOptionsToShow,
      defaultValue,
      value,
      onChange,
    });

    return (
      <FormGroup>
        {label && (
          <FormLabel
            htmlFor={id}
            required={required}
            disabled={disabled}
            hasError={errors.length > 0}
            className="mb-1.5"
          >
            {label}
          </FormLabel>
        )}
        <Popover
          open={isPopoverOpen}
          onOpenChange={setIsPopoverOpen}
          modal={asModal}
        >
          <PopoverTrigger asChild={asChild} disabled={disabled}>
            <Button
              ref={ref}
              id={id}
              name={name}
              type="button"
              role="combobox"
              autoFocus={autoFocus}
              onClick={handleTogglePopover}
              disabled={disabled}
              aria-invalid={errors.length > 0}
              aria-label={
                label ? undefined : multiple ? "Multi select" : "Select"
              }
              aria-required={required}
              aria-expanded={isPopoverOpen}
              className={cn(
                "flex h-auto min-h-10 w-full items-center justify-between p-1",
                "rounded-md border border-gray-200 bg-white",
                "hover:border-gray-300 hover:bg-gray-50",
                "dark:border-gray-700 dark:bg-gray-800",
                "dark:hover:border-gray-600 dark:hover:bg-gray-700",
                "focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1",
                "dark:focus:ring-gray-400 dark:focus:ring-offset-gray-900",
                disabled && [
                  "opacity-50",
                  "cursor-not-allowed",
                  "hover:bg-white dark:hover:bg-gray-800",
                ],
                errors.length > 0 && "border-red-500 dark:border-red-400",
                className,
              )}
              {...props}
            >
              <SelectedContent
                selectedValues={selectedValues}
                options={options}
                multiple={multiple}
                maxSelectedOptionsToShow={maxSelectedOptionsToShow}
                placeholder={placeholder}
                disabled={disabled}
                toggleOption={toggleOption}
                handleClear={handleClear}
                clearExtraOptions={clearExtraOptions}
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            onEscapeKeyDown={() => setIsPopoverOpen(false)}
            className="w-[--radix-popover-trigger-width] p-0"
          >
            <Content
              selectedValues={selectedValues}
              options={options}
              multiple={multiple}
              searchable={searchable}
              toggleOption={toggleOption}
              toggleAll={toggleAll}
            />
          </PopoverContent>
        </Popover>
        {description && (
          <FormDescription className="mt-1.5 dark:text-gray-400">
            {description}
          </FormDescription>
        )}
        {warnings.length > 0 && (
          <FormMessageList
            messages={warnings}
            type="warning"
            className="mt-1.5"
          />
        )}
        {errors.length > 0 && (
          <FormMessageList messages={errors} type="error" className="mt-1.5" />
        )}
      </FormGroup>
    );
  },
);

export const SelectField =
  withFieldValidation<SelectFieldProps>(SelectFieldRaw);
