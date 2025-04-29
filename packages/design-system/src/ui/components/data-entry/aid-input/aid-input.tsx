/* eslint-disable react/jsx-props-no-spreading */
import React, { useCallback, useId, useMemo } from "react";
import { IdAutocompleteContext } from "../../../../scalars/components/fragments/id-autocomplete/id-autocomplete-context.js";
import { IdAutocompleteListOption } from "../../../../scalars/components/fragments/id-autocomplete/id-autocomplete-list-option.js";
import { IdAutocomplete } from "../../../../scalars/components/fragments/id-autocomplete/index.js";
import type { AIDInputProps, AIDOption } from "./types.js";

const AIDInput = React.forwardRef<HTMLInputElement, AIDInputProps>(
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
      previewPlaceholder,
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
              ? previewPlaceholder?.path || "URL not available"
              : option.path || "URL not available"
          }
          value={
            displayProps?.asPlaceholder
              ? previewPlaceholder?.value || "aid not available"
              : option.value
          }
          description={option.description}
          agentType={
            displayProps?.asPlaceholder
              ? previewPlaceholder?.agentType || "Agent type not available"
              : option.agentType || "Agent type not available"
          }
          placeholderIcon={previewPlaceholder?.icon || "Person"}
          {...displayProps}
        />
      ),
      [variant, previewPlaceholder],
    );

    return (
      <IdAutocompleteContext.Provider value={contextValue}>
        {autoComplete && fetchOptionsCallback ? (
          <IdAutocomplete
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
            previewPlaceholder={previewPlaceholder}
            {...props}
            ref={ref}
          />
        ) : (
          <IdAutocomplete
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

AIDInput.displayName = "AIDInput";

export { AIDInput };
