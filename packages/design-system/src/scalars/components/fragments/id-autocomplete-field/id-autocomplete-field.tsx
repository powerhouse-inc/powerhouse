/* eslint-disable react/jsx-max-depth */
/* eslint-disable react/jsx-no-bind */
/* eslint-disable react/jsx-props-no-spreading */
import React, { useId, useRef } from "react";
import { cn } from "../../../lib/utils.js";
import type { ErrorHandling, FieldCommonProps } from "../../types.js";
import { Command } from "../command/command.js";
import { FormDescription } from "../form-description/form-description.js";
import { FormGroup } from "../form-group/form-group.js";
import { FormLabel } from "../form-label/form-label.js";
import { FormMessageList } from "../form-message/index.js";
import { Input } from "../input/input.js";
import { Popover, PopoverAnchor, PopoverContent } from "../popover/popover.js";
import { withFieldValidation } from "../with-field-validation/with-field-validation.js";
import { IdAutocompleteInputContainer } from "./id-autocomplete-input-container.js";
import { IdAutocompleteListOption } from "./id-autocomplete-list-option.js";
import { IdAutocompleteList } from "./id-autocomplete-list.js";
import type { IdAutocompleteProps } from "./types.js";
import { useIdAutocompleteField } from "./use-id-autocomplete-field.js";

type IdAutocompleteFieldBaseProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  | keyof FieldCommonProps<string>
  | keyof ErrorHandling
  | keyof IdAutocompleteProps
  | "pattern"
>;

export type IdAutocompleteFieldProps = IdAutocompleteFieldBaseProps &
  FieldCommonProps<string> &
  ErrorHandling &
  IdAutocompleteProps;

export const IdAutocompleteFieldRaw = React.forwardRef<
  HTMLInputElement,
  IdAutocompleteFieldProps
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
      onKeyDown,
      onMouseDown,
      autoComplete = true,
      variant = "withValue",
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
    const id = idProp ?? `${prefix}-id-autocomplete`;
    const inputRef = useRef<HTMLInputElement | null>(null);

    const mergedRef = (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    };

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
      isFetchSelectedOptionSync,
      toggleOption,
      handleOpenChange,
      onTriggerBlur,
      handleChange,
      handleCommandValue,
      handleFetchSelectedOption,
      handlePaste,
    } = useIdAutocompleteField({
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

    const handleOptionSelection = (optionValue: string) => {
      toggleOption(optionValue);
      inputRef.current?.focus();
    };

    const asCard =
      variant === "withValueAndTitle" ||
      variant === "withValueTitleAndDescription";

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
                <IdAutocompleteInputContainer
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
                  optionsLength={options.length}
                  handleOpenChange={handleOpenChange}
                  onKeyDown={onKeyDown}
                  onMouseDown={onMouseDown}
                  placeholder={placeholder}
                  hasError={hasError}
                  label={label}
                  required={required}
                  isPopoverOpen={isPopoverOpen}
                  maxLength={maxLength}
                  handlePaste={handlePaste}
                  {...props}
                  ref={mergedRef}
                />
              </PopoverAnchor>
              {asCard &&
                (renderOption ? (
                  renderOption(
                    {
                      ...selectedOption,
                      value: selectedOption?.value ?? "",
                    },
                    {
                      asPlaceholder: selectedOption === undefined,
                      showValue: false,
                      isLoadingSelectedOption,
                      handleFetchSelectedOption: fetchSelectedOptionCallback
                        ? handleFetchSelectedOption
                        : undefined,
                      isFetchSelectedOptionSync,
                      className: cn("rounded-t-none pt-2"),
                    },
                  )
                ) : (
                  <IdAutocompleteListOption
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
                    isFetchSelectedOptionSync={isFetchSelectedOptionSync}
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
                <IdAutocompleteList
                  variant={variant}
                  commandListRef={commandListRef}
                  selectedValue={selectedValue}
                  options={options}
                  toggleOption={handleOptionSelection}
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
            aria-label={!label ? "Id Autocomplete field" : undefined}
            aria-required={required}
            maxLength={maxLength}
            {...props}
            ref={mergedRef}
          />
        )}
        {!!description && <FormDescription>{description}</FormDescription>}
        {hasWarning && <FormMessageList messages={warnings} type="warning" />}
        {hasError && <FormMessageList messages={errors} type="error" />}
      </FormGroup>
    );
  },
);

export const IdAutocompleteField =
  withFieldValidation<IdAutocompleteFieldProps>(IdAutocompleteFieldRaw);

IdAutocompleteField.displayName = "IdAutocompleteField";
