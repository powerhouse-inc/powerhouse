/* eslint-disable react/jsx-props-no-spreading */
import React, { useCallback, useId, useMemo } from "react";
import { isAddress } from "viem";
import { IdAutocompleteContext } from "../fragments/id-autocomplete-field/id-autocomplete-context.js";
import { IdAutocompleteListOption } from "../fragments/id-autocomplete-field/id-autocomplete-list-option.js";
import { IdAutocompleteFieldRaw } from "../fragments/id-autocomplete-field/index.js";
import { withFieldValidation } from "../fragments/with-field-validation/index.js";
import type { FieldErrorHandling, InputBaseProps } from "../types.js";
import type { AIDOption, AIDProps } from "./types.js";

type AIDFieldBaseProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  | keyof InputBaseProps<string>
  | keyof FieldErrorHandling
  | keyof AIDProps
  | "pattern"
>;

export type AIDFieldProps = AIDFieldBaseProps &
  InputBaseProps<string> &
  FieldErrorHandling &
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
      supportedNetworks,
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

    const contextValue = useMemo(
      () => ({ supportedNetworks }),
      [supportedNetworks],
    );

    const renderOption = useCallback(
      (
        option: AIDOption,
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
              ? { text: "URL not available" }
              : option.path
          }
          value={
            displayProps?.asPlaceholder ? "aid not available" : option.value
          }
          description={option.description}
          agentType={
            displayProps?.asPlaceholder
              ? "Agent type not available"
              : option.agentType
          }
          placeholderIcon="Person"
          {...displayProps}
        />
      ),
      [variant],
    );

    return (
      <IdAutocompleteContext.Provider value={contextValue}>
        {autoComplete && fetchOptionsCallback ? (
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
        )}
      </IdAutocompleteContext.Provider>
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

        // Basic DID format validation
        if (!value.startsWith("did:ethr:")) {
          return "Invalid DID format. Must start with did:ethr:";
        }

        // Validate DID parts
        const didParts = value.split(":");
        if (didParts.length < 3 || didParts.length > 4) {
          return "Invalid DID format. Must be in the format did:ethr:chainId:address (chainId is optional)";
        }

        // Validate chainId
        if (didParts.length === 4) {
          const chainId = didParts[2];

          if (!/^0x[0-9a-fA-F]+$/.test(chainId)) {
            return "Invalid chainId format. Must be a hexadecimal number with 0x prefix";
          }

          if (Array.isArray(supportedNetworks)) {
            if (
              !supportedNetworks.some((network) => network.chainId === chainId)
            ) {
              return `Invalid chainId. Allowed chainIds are: ${supportedNetworks
                .map((network) => network.chainId)
                .join(", ")}`;
            }
          }
        }

        // Extract Ethereum address
        const address = didParts[didParts.length - 1];

        // Validate basic Ethereum address format
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
          return "Invalid Ethereum address format. Must be a 40 character hexadecimal number with 0x prefix.";
        }

        // Validate checksum
        if (!isAddress(address)) {
          return "Invalid Ethereum address checksum.";
        }

        return true;
      },
  },
});

AIDField.displayName = "AIDField";
