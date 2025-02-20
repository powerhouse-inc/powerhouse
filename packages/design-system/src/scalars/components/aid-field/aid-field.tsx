/* eslint-disable react/jsx-props-no-spreading */
import React, { useId, useCallback } from "react";
import { AutocompleteFieldRaw } from "@/scalars/components/fragments/autocomplete-field";
import { AutocompleteListOption } from "@/scalars/components/fragments/autocomplete-field/autocomplete-list-option";
import { withFieldValidation } from "@/scalars/components/fragments/with-field-validation";
import type {
  FieldCommonProps,
  ErrorHandling,
} from "@/scalars/components/types";
import type { AIDProps } from "./types";
import type { AutocompleteOption } from "@/scalars/components/fragments/autocomplete-field/types";

type AIDFieldBaseProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  | keyof FieldCommonProps<string>
  | keyof ErrorHandling
  | keyof AIDProps
  | "pattern"
>;

export type AIDFieldProps = AIDFieldBaseProps &
  FieldCommonProps<string> &
  ErrorHandling &
  AIDProps;

const AIDFieldRaw = React.forwardRef<HTMLInputElement, AIDFieldProps>(
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
      supportedNetworks, // used in field validation
      autoComplete: autoCompleteProp,
      variant = "withValue",
      maxLength,
      fetchOptionsCallback,
      fetchSelectedOptionCallback,
      isOpenByDefault, // to be used only in stories
      initialOptions, // to be used only in stories
      ...props
    },
    ref,
  ) => {
    const prefix = useId();
    const id = idProp ?? `${prefix}-aid`;
    const autoComplete = autoCompleteProp ?? true;

    const renderOption = useCallback(
      (
        option: AutocompleteOption,
        displayProps?: {
          asPlaceholder?: boolean;
          showValue?: boolean;
          isLoadingSelectedOption?: boolean;
          handleFetchSelectedOption?: (value: string) => void;
          className?: string;
        },
      ) => (
        <AutocompleteListOption
          variant={variant}
          icon={option.icon}
          title={option.title}
          path={option.path}
          value={
            option.value === "value not available"
              ? "aid not available"
              : option.value
          }
          description={option.description}
          {...displayProps}
        />
      ),
      [variant],
    );

    return autoComplete && fetchOptionsCallback ? (
      <AutocompleteFieldRaw
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
        maxLength={maxLength}
        fetchOptionsCallback={fetchOptionsCallback}
        fetchSelectedOptionCallback={fetchSelectedOptionCallback}
        isOpenByDefault={isOpenByDefault}
        initialOptions={initialOptions}
        renderOption={renderOption}
        {...props}
        ref={ref}
      />
    ) : (
      <AutocompleteFieldRaw
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
        maxLength={maxLength}
        {...props}
        ref={ref}
      />
    );
  },
);

export const AIDField = withFieldValidation<AIDFieldProps>(AIDFieldRaw, {
  validations: {
    _validAIDFormat:
      ({ supportedNetworks }) =>
      (value: string | undefined) => {
        if (value === "" || value === undefined) {
          return true;
        }

        // TODO: add validation

        return true;
      },
  },
});

AIDField.displayName = "AIDField";
