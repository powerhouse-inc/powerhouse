/* eslint-disable react/jsx-props-no-spreading */
import React, { useId, useCallback } from "react";
import { IdAutocompleteFieldRaw } from "@/scalars/components/fragments/id-autocomplete-field";
import { IdAutocompleteListOption } from "@/scalars/components/fragments/id-autocomplete-field/id-autocomplete-list-option";
import { withFieldValidation } from "@/scalars/components/fragments/with-field-validation";
import type {
  FieldCommonProps,
  ErrorHandling,
} from "@/scalars/components/types";
import type { PHIDProps } from "./types";
import type { IdAutocompleteOption } from "@/scalars/components/fragments/id-autocomplete-field/types";

type PHIDFieldBaseProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  | keyof FieldCommonProps<string>
  | keyof ErrorHandling
  | keyof PHIDProps
  | "pattern"
>;

export type PHIDFieldProps = PHIDFieldBaseProps &
  FieldCommonProps<string> &
  ErrorHandling &
  PHIDProps;

const PHIDFieldRaw = React.forwardRef<HTMLInputElement, PHIDFieldProps>(
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
      allowedScopes, // used in field validation
      allowUris, // used in field validation
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
    const id = idProp ?? `${prefix}-phid`;
    const autoComplete = autoCompleteProp ?? true;

    const renderOption = useCallback(
      (
        option: IdAutocompleteOption,
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
          path={option.path}
          value={
            displayProps?.asPlaceholder &&
            option.value === "value not available"
              ? "phd not available"
              : option.value
          }
          description={option.description}
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
        maxLength={maxLength}
        {...props}
        ref={ref}
      />
    );
  },
);

export const PHIDField = withFieldValidation<PHIDFieldProps>(PHIDFieldRaw, {
  validations: {
    _validPHIDFormat:
      ({ allowUris, allowedScopes }) =>
      (value: string | undefined) => {
        if (value === "" || value === undefined) {
          return true;
        }

        // URL pattern
        // Domain segments can start/end with alphanumeric and contain hyphens
        // Multiple segments separated by dots are allowed (e.g., sub.domain.com)
        const domainSegment = "[a-zA-Z0-9](?:[a-zA-Z0-9\\-]*[a-zA-Z0-9])?";
        const domain = `${domainSegment}(?:\\.${domainSegment})*`;
        const uuidPattern =
          "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
        const URLFormat = `^phd://${domain}/${uuidPattern}$`;

        // Validate URL format first
        const isValidURLFormat = new RegExp(URLFormat).test(value);
        if (isValidURLFormat) {
          return true;
        }

        // If it's not a URL and URIs are not allowed, return error
        if (allowUris !== true) {
          return "Invalid format. Please use URL format: phd://<domain>/<documentID>";
        }

        // URI patterns
        const branchScopePattern = "[a-zA-Z][a-zA-Z0-9\\-/_]*[a-zA-Z0-9]";

        // Valid URI formats
        const URIFormats = [
          `^phd:${uuidPattern}$`,
          `^phd:${uuidPattern}:${branchScopePattern}$`,
          `^phd:${uuidPattern}::${branchScopePattern}$`,
          `^phd:${uuidPattern}:${branchScopePattern}:${branchScopePattern}$`,
        ];

        const isValidURIFormat = URIFormats.some((format) =>
          new RegExp(format).test(value),
        );
        if (!isValidURIFormat) {
          return "Invalid format. Please use either URL format: phd://<domain>/<documentID> or URI format: phd:uuid, phd:uuid:branch, phd:uuid::scope, or phd:uuid:branch:scope";
        }

        // Validate scope
        if (Array.isArray(allowedScopes)) {
          const scopeMatch =
            /.*:.*::([^:]+)$/.exec(value) || /.*:.*:.*:([^:]+)$/.exec(value);
          if (scopeMatch && !allowedScopes.includes(scopeMatch[1])) {
            return `Invalid scope. Allowed scopes are: ${allowedScopes.join(", ")}`;
          }
        }

        return true;
      },
  },
});

PHIDField.displayName = "PHIDField";
