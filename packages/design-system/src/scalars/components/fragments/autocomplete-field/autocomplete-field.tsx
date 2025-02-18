/* eslint-disable react/jsx-max-depth */
/* eslint-disable react/jsx-no-bind */
/* eslint-disable react/jsx-props-no-spreading */
import React, { useId } from "react";
import { Command } from "@/scalars/components/fragments/command";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/scalars/components/fragments/popover";
import { FormGroup } from "@/scalars/components/fragments/form-group";
import { FormLabel } from "@/scalars/components/fragments/form-label";
import { FormDescription } from "@/scalars/components/fragments/form-description";
import { FormMessageList } from "@/scalars/components/fragments/form-message";
import { Input } from "@/scalars/components/fragments/input";
import { withFieldValidation } from "@/scalars/components/fragments/with-field-validation";
import { cn } from "@/scalars/lib/utils";
import type {
  FieldCommonProps,
  ErrorHandling,
} from "@/scalars/components/types";
import type { AutocompleteProps } from "./types";
import { useAutocompleteField } from "./use-autocomplete-field";
import { AutocompleteInputContainer } from "./autocomplete-input-container";
import { AutocompleteList } from "./autocomplete-list";
import { AutocompleteListOption } from "./autocomplete-list-option";

type AutocompleteFieldBaseProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  | keyof FieldCommonProps<string>
  | keyof ErrorHandling
  | keyof AutocompleteProps
  | "pattern"
>;

export type AutocompleteFieldProps = AutocompleteFieldBaseProps &
  FieldCommonProps<string> &
  ErrorHandling &
  AutocompleteProps;

export const AutocompleteFieldRaw = React.forwardRef<
  HTMLInputElement,
  AutocompleteFieldProps
>(
  (
    {
      id: idProp,
      name,
      className,
      label,
      description,
      value,
      defaultValue,
      disabled,
      placeholder,
      required,
      errors,
      warnings,
      onChange,
      onBlur,
      onClick,
      onMouseDown,
      autoComplete = true,
      variant = "withIdTitleAndDescription",
      maxLength,
      fetchOptionsCallback,
      fetchSelectedOptionCallback,
      isOpenByDefault, // to be used only in stories
      initialOptions, // to be used only in stories
      renderOption,
      ...props
    },
    ref,
  ) => {
    const prefix = useId();
    const id = idProp ?? `${prefix}-autocomplete`;

    const hasWarning = Array.isArray(warnings) && warnings.length > 0;
    const hasError = Array.isArray(errors) && errors.length > 0;

    const {
      selectedValue,
      selectedOption,
      isPopoverOpen,
      commandListRef,
      options,
      isLoading,
      isLoadingSelectedOption,
      haveFetchError,
      commandValue,
      toggleOption,
      handleOpenChange,
      onTriggerBlur,
      handleChange,
      handleCommandValue,
      handleFetchSelectedOption,
      handlePaste,
    } = useAutocompleteField({
      autoComplete,
      defaultValue,
      value,
      isOpenByDefault,
      initialOptions,
      onChange,
      onBlur,
      fetchOptions: fetchOptionsCallback,
      fetchSelectedOption: fetchSelectedOptionCallback,
    });

    const asCard =
      variant === "withIdAndTitle" || variant === "withIdTitleAndDescription";

    return (
      <FormGroup>
        {!!label && (
          <FormLabel
            htmlFor={id}
            disabled={disabled}
            hasError={hasError}
            required={required}
            onClick={(e) => {
              e.preventDefault();
              (e.target as HTMLLabelElement).control?.focus();
            }}
          >
            {label}
          </FormLabel>
        )}
        {autoComplete && fetchOptionsCallback ? (
          <Popover open={isPopoverOpen} onOpenChange={handleOpenChange}>
            <Command
              shouldFilter={false}
              value={commandValue}
              onValueChange={handleCommandValue}
              className={cn("dark:bg-charcoal-900 bg-gray-100")}
            >
              <PopoverAnchor asChild={true}>
                <AutocompleteInputContainer
                  id={id}
                  name={name}
                  value={selectedValue}
                  className={className}
                  isLoading={isLoading}
                  haveFetchError={haveFetchError}
                  disabled={disabled}
                  onChange={handleChange}
                  onBlur={onTriggerBlur}
                  onClick={onClick}
                  selectedOption={selectedOption}
                  handleOpenChange={handleOpenChange}
                  onMouseDown={onMouseDown}
                  placeholder={placeholder}
                  hasError={hasError}
                  label={label}
                  required={required}
                  isPopoverOpen={isPopoverOpen}
                  maxLength={maxLength}
                  handlePaste={handlePaste}
                  {...props}
                  ref={ref}
                />
              </PopoverAnchor>
              {asCard &&
                (renderOption ? (
                  renderOption(
                    {
                      icon: selectedOption?.icon,
                      title: selectedOption?.title,
                      path: selectedOption?.path,
                      value: selectedOption?.value ?? "",
                      description: selectedOption?.description,
                    },
                    {
                      asPlaceholder: selectedOption === undefined,
                      showValue: false,
                      isLoadingSelectedOption,
                      handleFetchSelectedOption: fetchSelectedOptionCallback
                        ? handleFetchSelectedOption
                        : undefined,
                      className: cn("rounded-t-none pt-2"),
                    },
                  )
                ) : (
                  <AutocompleteListOption
                    variant={variant}
                    icon={selectedOption?.icon}
                    title={selectedOption?.title}
                    path={selectedOption?.path}
                    value={selectedOption?.value ?? ""}
                    description={selectedOption?.description}
                    asPlaceholder={selectedOption === undefined}
                    showValue={false}
                    isLoadingSelectedOption={isLoadingSelectedOption}
                    handleFetchSelectedOption={
                      fetchSelectedOptionCallback
                        ? handleFetchSelectedOption
                        : undefined
                    }
                    className={cn("rounded-t-none pt-2")}
                  />
                ))}
              <PopoverContent
                align="start"
                onOpenAutoFocus={(e) => e.preventDefault()}
                onInteractOutside={(e) => {
                  if (e.target instanceof Element && e.target.id === id) {
                    e.preventDefault();
                  }
                }}
              >
                <AutocompleteList
                  variant={variant}
                  commandListRef={commandListRef}
                  selectedValue={selectedValue}
                  options={options}
                  toggleOption={toggleOption}
                  renderOption={renderOption}
                />
              </PopoverContent>
            </Command>
          </Popover>
        ) : (
          <Input
            id={id}
            name={name}
            value={selectedValue}
            className={className}
            disabled={disabled}
            onChange={handleChange}
            onBlur={onBlur}
            onClick={onClick}
            onMouseDown={onMouseDown}
            placeholder={placeholder}
            aria-invalid={hasError}
            aria-label={!label ? "Autocomplete field" : undefined}
            aria-required={required}
            maxLength={maxLength}
            {...props}
            ref={ref}
          />
        )}
        {!!description && <FormDescription>{description}</FormDescription>}
        {hasWarning && <FormMessageList messages={warnings} type="warning" />}
        {hasError && <FormMessageList messages={errors} type="error" />}
      </FormGroup>
    );
  },
);

export const AutocompleteField =
  withFieldValidation<AutocompleteFieldProps>(AutocompleteFieldRaw);

AutocompleteField.displayName = "AutocompleteField";
