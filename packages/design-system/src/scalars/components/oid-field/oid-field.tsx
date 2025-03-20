/* eslint-disable react/jsx-props-no-spreading */
import React, { useCallback, useId } from "react";
import { IdAutocompleteListOption } from "../fragments/id-autocomplete-field/id-autocomplete-list-option.js";
import { IdAutocompleteFieldRaw } from "../fragments/id-autocomplete-field/index.js";
import { withFieldValidation } from "../fragments/with-field-validation/index.js";
import type { FieldErrorHandling, InputBaseProps } from "../types.js";
import type { OIDOption, OIDProps } from "./types.js";

type OIDFieldBaseProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  | keyof InputBaseProps<string>
  | keyof FieldErrorHandling
  | keyof OIDProps
  | "pattern"
>;

export type OIDFieldProps = OIDFieldBaseProps &
  InputBaseProps<string> &
  FieldErrorHandling &
  OIDProps;

const OIDFieldRaw = React.forwardRef<HTMLInputElement, OIDFieldProps>(
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
      autoComplete: autoCompleteProp,
      variant = "withValue",
      fetchOptionsCallback,
      fetchSelectedOptionCallback,
      isOpenByDefault, // to be used only in stories
      initialOptions, // to be used only in stories
      ...props
    },
    ref,
  ) => {
    const prefix = useId();
    const id = idProp ?? `${prefix}-oid`;
    const autoComplete = autoCompleteProp ?? true;

    const renderOption = useCallback(
      (
        option: OIDOption,
        displayProps?: {
          asPlaceholder?: boolean;
          showValue?: boolean;
          isLoadingSelectedOption?: boolean;
          handleFetchSelectedOption?: (value: string) => void;
          isFetchSelectedOptionSync?: boolean;
          className?: string;
        },
      ) => (
        <IdAutocompleteListOption
          variant={variant}
          icon={option.icon}
          title={option.title}
          path={
            displayProps?.asPlaceholder
              ? { text: "Type not available" }
              : option.path
          }
          value={
            displayProps?.asPlaceholder ? "oid not available" : option.value
          }
          description={option.description}
          placeholderIcon="Braces"
          {...displayProps}
        />
      ),
      [variant],
    );

    return autoComplete && fetchOptionsCallback ? (
      <IdAutocompleteFieldRaw
        id={id}
        name={name}
        className={className}
        label={label}
        description={description}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        placeholder={placeholder}
        required={required}
        errors={errors}
        warnings={warnings}
        onChange={onChange}
        onBlur={onBlur}
        onClick={onClick}
        onMouseDown={onMouseDown}
        autoComplete={true}
        variant={variant}
        fetchOptionsCallback={fetchOptionsCallback}
        fetchSelectedOptionCallback={fetchSelectedOptionCallback}
        isOpenByDefault={isOpenByDefault}
        initialOptions={initialOptions}
        renderOption={renderOption}
        {...props}
        ref={ref}
      />
    ) : (
      <IdAutocompleteFieldRaw
        id={id}
        name={name}
        className={className}
        label={label}
        description={description}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        placeholder={placeholder}
        required={required}
        errors={errors}
        warnings={warnings}
        onChange={onChange}
        onBlur={onBlur}
        onClick={onClick}
        onMouseDown={onMouseDown}
        autoComplete={false}
        {...props}
        ref={ref}
      />
    );
  },
);

export const OIDField = withFieldValidation<OIDFieldProps>(OIDFieldRaw, {
  validations: {
    _validOIDFormat: () => (value: string | undefined) => {
      if (value === "" || value === undefined) {
        return true;
      }

      const uuidPattern =
        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

      const isValidUUID = new RegExp(uuidPattern).test(value);
      if (!isValidUUID) {
        return "Invalid uuid format. Please enter a valid uuid v4.";
      }

      return true;
    },
  },
});

OIDField.displayName = "OIDField";
