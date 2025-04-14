/* eslint-disable react/jsx-props-no-spreading */
import React, { useCallback, useId, useMemo } from "react";
import { IdAutocompleteContext } from "../../../../scalars/components/fragments/id-autocomplete/id-autocomplete-context.js";
import { IdAutocompleteListOption } from "../../../../scalars/components/fragments/id-autocomplete/id-autocomplete-list-option.js";
import { IdAutocomplete } from "../../../../scalars/components/fragments/id-autocomplete/index.js";
import type { PHIDInputProps, PHIDOption } from "./types.js";

const PHIDInput = React.forwardRef<HTMLInputElement, PHIDInputProps>(
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
      allowUris,
      allowedScopes,
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
    const id = idProp ?? `${prefix}-phid`;
    const autoComplete = autoCompleteProp ?? true;

    const contextValue = useMemo(
      () => ({ allowUris, allowedScopes }),
      [allowUris, allowedScopes],
    );

    const renderOption = useCallback(
      (
        option: PHIDOption,
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
              ? previewPlaceholder?.path || "Type not available"
              : option.path || "Type not available"
          }
          value={
            displayProps?.asPlaceholder
              ? previewPlaceholder?.value || "phid not available"
              : option.value
          }
          description={option.description}
          placeholderIcon={previewPlaceholder?.icon || undefined}
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

PHIDInput.displayName = "PHIDInput";

export { PHIDInput };
