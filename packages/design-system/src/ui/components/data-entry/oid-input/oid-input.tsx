/* eslint-disable react/jsx-props-no-spreading */
import React, { useCallback, useId } from "react";
import { IdAutocompleteListOption } from "../../../../scalars/components/fragments/id-autocomplete/id-autocomplete-list-option.js";
import { IdAutocomplete } from "../../../../scalars/components/fragments/id-autocomplete/index.js";
import type { OIDInputProps, OIDOption } from "./types.js";

const OIDInput = React.forwardRef<HTMLInputElement, OIDInputProps>(
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
      previewPlaceholder,
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
              ? previewPlaceholder?.path || "Type not available"
              : option.path || "Type not available"
          }
          value={
            displayProps?.asPlaceholder
              ? previewPlaceholder?.value || "oid not available"
              : option.value
          }
          description={option.description}
          placeholderIcon={previewPlaceholder?.icon || "Braces"}
          {...displayProps}
        />
      ),
      [variant, previewPlaceholder],
    );

    return autoComplete && fetchOptionsCallback ? (
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
        {...props}
        ref={ref}
      />
    );
  },
);

OIDInput.displayName = "OIDInput";

export { OIDInput };
