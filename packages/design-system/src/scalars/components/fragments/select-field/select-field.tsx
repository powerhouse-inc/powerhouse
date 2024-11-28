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
import { FieldCommonProps, ErrorHandling } from "@/scalars/components/types";
import { SelectProps } from "@/scalars/components/enum-field/types";
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

export const SelectFieldRaw = React.forwardRef<
  HTMLButtonElement,
  SelectFieldProps
>(
  (
    {
      // core functionality props
      options = [],
      optionsCheckmark = "Auto",
      multiple,
      defaultValue,
      value,
      onChange,

      // form-related props
      autoFocus,
      id: propId,
      name,
      label,
      required,
      disabled,

      // validation props
      errors = [],
      warnings = [],

      // behavior props
      asModal,
      searchable,

      // display props
      description,
      maxSelectedOptionsToShow = 3,
      placeholder,
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
    } = useSelectField({
      options,
      multiple,
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
            inline={false}
          >
            {label}
          </FormLabel>
        )}
        <Popover
          open={isPopoverOpen}
          onOpenChange={setIsPopoverOpen}
          modal={asModal}
        >
          <PopoverTrigger asChild={true}>
            <Button
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
                "flex h-9 w-full items-center justify-between px-3 py-2",
                "dark:border-charcoal-700 dark:bg-charcoal-900 rounded-md border border-gray-300 bg-white",
                "hover:border-gray-300 hover:bg-gray-100",
                "dark:hover:border-charcoal-700 dark:hover:bg-charcoal-800",
                "dark:focus:ring-charcoal-300 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:ring-offset-0",
                "dark:focus-visible:ring-charcoal-300 focus-visible:ring-1 focus-visible:ring-gray-900 focus-visible:ring-offset-0",
                disabled && [
                  "opacity-50",
                  "cursor-not-allowed",
                  "dark:hover:border-charcoal-700 dark:hover:bg-charcoal-900 hover:border-gray-300 hover:bg-white",
                ],
                className,
              )}
              {...props}
              ref={ref}
            >
              <SelectedContent
                selectedValues={selectedValues}
                options={options}
                multiple={multiple}
                searchable={searchable}
                maxSelectedOptionsToShow={maxSelectedOptionsToShow}
                placeholder={placeholder}
                disabled={disabled}
                handleClear={handleClear}
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            onEscapeKeyDown={() => setIsPopoverOpen(false)}
            className={cn(
              "w-[--radix-popover-trigger-width] px-0 py-1",
              "border border-gray-300 bg-white dark:border-slate-500 dark:bg-slate-600",
              "rounded shadow-[1px_4px_15px_0px_rgba(74,88,115,0.25)] dark:shadow-[1px_4px_15.3px_0px_#141921]",
            )}
          >
            <Content
              selectedValues={selectedValues}
              options={options}
              optionsCheckmark={optionsCheckmark}
              multiple={multiple}
              searchable={searchable}
              toggleOption={toggleOption}
              toggleAll={toggleAll}
            />
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

export const SelectField = withFieldValidation<SelectFieldProps>(
  SelectFieldRaw,
) as React.ForwardRefExoticComponent<
  SelectFieldProps & React.RefAttributes<HTMLButtonElement>
>;

SelectField.displayName = "SelectField";
