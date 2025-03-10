/* eslint-disable react/jsx-max-depth */
/* eslint-disable react/jsx-no-bind */
/* eslint-disable react/jsx-props-no-spreading */
import type { ErrorHandling, FieldCommonProps } from "#scalars";
import {
  cn,
  Command,
  FormDescription,
  FormGroup,
  FormLabel,
  FormMessageList,
  Input,
  Popover,
  PopoverAnchor,
  PopoverContent,
  withFieldValidation,
} from "#scalars";
import React, { useId } from "react";
import { PHIDInputContainer } from "./phid-input-container.js";
import { PHIDList } from "./phid-list.js";
import { PHIDListItem } from "./phid-list-item.js";
import type { PHIDProps } from "./types.js";
import { usePHIDField } from "./use-phid-field.js";

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
      autoComplete = true,
      allowDataObjectReference = false, // allways false for now
      variant = "withId",
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
    } = usePHIDField({
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
                <PHIDInputContainer
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
              {asCard && (
                <PHIDListItem
                  variant={variant}
                  icon={selectedOption?.icon}
                  title={selectedOption?.title}
                  path={selectedOption?.path}
                  phid={selectedOption?.phid ?? ""}
                  description={selectedOption?.description}
                  asPlaceholder={selectedOption === undefined}
                  showPHID={false}
                  isLoadingSelectedOption={isLoadingSelectedOption}
                  handleFetchSelectedOption={
                    fetchSelectedOptionCallback
                      ? handleFetchSelectedOption
                      : undefined
                  }
                  className={cn("rounded-t-none pt-2")}
                />
              )}
              <PopoverContent
                align="start"
                onOpenAutoFocus={(e) => e.preventDefault()}
                onInteractOutside={(e) => {
                  if (e.target instanceof Element && e.target.id === id) {
                    e.preventDefault();
                  }
                }}
              >
                <PHIDList
                  variant={variant}
                  commandListRef={commandListRef}
                  selectedValue={selectedValue}
                  options={options}
                  toggleOption={toggleOption}
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
            aria-label={!label ? "PHID field" : undefined}
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
        if (allowUris === false) {
          return "Please use a URL format: phd://<domain>/<documentID>";
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
          return "Invalid format. Please use either: URL format: phd://<domain>/<documentID> or URI format: phd:uuid, phd:uuid:branch, phd:uuid::scope, or phd:uuid:branch:scope";
        }

        // Validate scope if present
        const scopeMatch =
          /.*:.*::([^:]+)$/.exec(value) || /.*:.*:.*:([^:]+)$/.exec(value);
        if (
          scopeMatch &&
          Array.isArray(allowedScopes) &&
          allowedScopes.length > 0
        ) {
          const scope = scopeMatch[1];
          if (!allowedScopes.includes(scope)) {
            return `Invalid scope. Allowed scopes are: ${allowedScopes.join(", ")}`;
          }
        }

        return true;
      },
  },
});

PHIDField.displayName = "PHIDField";
