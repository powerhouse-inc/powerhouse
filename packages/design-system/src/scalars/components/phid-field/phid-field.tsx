/* eslint-disable react/jsx-max-depth */
/* eslint-disable react/jsx-no-bind */
/* eslint-disable react/jsx-props-no-spreading */
import React, { useId, useCallback } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Command } from "@/scalars/components/fragments/command";
import { Input } from "@/scalars/components/fragments/input";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/scalars/components/fragments/popover";
import { FormGroup } from "@/scalars/components/fragments/form-group";
import { FormLabel } from "@/scalars/components/fragments/form-label";
import { FormDescription } from "@/scalars/components/fragments/form-description";
import { FormMessageList } from "@/scalars/components/fragments/form-message";
import { withFieldValidation } from "@/scalars/components/fragments/with-field-validation";
import { cn } from "@/scalars/lib/utils";
import type {
  FieldCommonProps,
  ErrorHandling,
} from "@/scalars/components/types";
import type { PHIDProps } from "./types";
import { usePHIDField } from "./use-phid-field";
import { PHIDList } from "./phid-list";
import { PHIDListItem } from "./phid-list-item";

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
      defaultBranch = "main",
      defaultScope = "public",
      allowedScopes,
      allowedDocumentTypes,
      allowUris,
      autoComplete = true,
      allowDataObjectReference = false,
      variant = "withId",
      minLength,
      maxLength,
      ...props
    },
    ref,
  ) => {
    const prefix = useId();
    const id = idProp ?? `${prefix}-phid`;

    const hasWarning = Array.isArray(warnings) && warnings.length > 0;
    const hasError = Array.isArray(errors) && errors.length > 0;

    // Temporary
    const options = [
      { phid: "phd:baefc2a4-f9a0-4950-8161-fd8d8cc7dea7", title: "PHID 1" },
      { phid: "phd:baefc2a4-f9a0-4950-8161-fd8d8cc6cdb8", title: "PHID 2" },
      { phid: "phd:baefc2a4-f9a0-4950-8161-fd8d8cc5efc9", title: "PHID 3" },
    ];

    const {
      selectedValue,
      isPopoverOpen,
      commandListRef,
      toggleOption,
      handleClear,
      handleOpenChange,
      handleSelectedValueChange,
    } = usePHIDField({
      defaultValue,
      value,
      onChange,
      onBlur,
    });

    // Temporary
    const selectedOption = options.find((opt) => opt.phid === selectedValue);

    const onTriggerBlur = useCallback(
      (event: any) => {
        if (!isPopoverOpen) {
          onBlur?.(event as React.FocusEvent<HTMLInputElement>);
        }
      },
      [onBlur, isPopoverOpen],
    );

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
        <Popover open={isPopoverOpen} onOpenChange={handleOpenChange}>
          <Command shouldFilter={false}>
            <PopoverAnchor asChild={true}>
              {/* Temporary */}
              {selectedOption !== undefined && variant !== "withId" ? (
                <div
                  onClick={() => {
                    handleClear();
                  }}
                  className={cn(
                    "dark:border-charcoal-700 dark:bg-charcoal-900 cursor-pointer rounded-md border border-gray-300 bg-white",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-900 focus-visible:ring-offset-0 focus-visible:ring-offset-white",
                    "dark:focus-visible:ring-charcoal-300 dark:focus-visible:ring-offset-charcoal-900 dark:focus:bg-charcoal-900 focus:bg-gray-50",
                  )}
                >
                  <PHIDListItem
                    variant={variant}
                    title={selectedOption.title}
                    phid={selectedOption.phid}
                  />
                </div>
              ) : (
                <CommandPrimitive.Input asChild>
                  <Input
                    id={id}
                    name={name}
                    value={selectedValue}
                    className={className}
                    disabled={disabled}
                    onChange={(e) => {
                      handleSelectedValueChange(e.target.value);
                      if (options.some((opt) => opt.phid === e.target.value)) {
                        handleOpenChange(false);
                      } else if (autoComplete && e.target.value !== "") {
                        handleOpenChange(true);
                      } else {
                        handleOpenChange(false);
                      }
                      onChange?.(e.target.value);
                    }}
                    onBlur={onTriggerBlur}
                    onClick={(e) => {
                      if (selectedOption !== undefined) {
                        handleClear();
                      } else if (
                        autoComplete &&
                        (e.target as HTMLInputElement).value !== ""
                      ) {
                        handleOpenChange(true);
                      }
                      props.onClick?.(e);
                    }}
                    placeholder={placeholder}
                    aria-invalid={hasError}
                    aria-label={!label ? "PHID field" : undefined}
                    aria-required={required}
                    aria-expanded={isPopoverOpen}
                    {...props}
                    ref={ref}
                  />
                </CommandPrimitive.Input>
              )}
            </PopoverAnchor>
            <PopoverContent
              align="start"
              className={cn(
                "w-[--radix-popover-trigger-width] p-0",
                "border-gray-300 bg-white dark:border-slate-500 dark:bg-slate-700",
                "rounded shadow-[1px_4px_15px_0px_rgba(74,88,115,0.25)] dark:shadow-[1px_4px_15.3px_0px_#141921]",
              )}
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

        // URI regex patterns
        const uuidPattern =
          "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
        const branchPattern = "[a-zA-Z0-9][a-zA-Z0-9-/]*[a-zA-Z0-9]"; // Until PH defines the pattern to be used
        const scopePattern = "[a-zA-Z0-9][a-zA-Z0-9-/]*[a-zA-Z0-9]"; // Until PH defines the pattern to be used

        // Valid URI formats
        const URIFormats = [
          `^phd:${uuidPattern}$`,
          `^phd:${uuidPattern}:${branchPattern}$`,
          `^phd:${uuidPattern}::${scopePattern}$`,
          `^phd:${uuidPattern}:${branchPattern}:${scopePattern}$`,
        ];

        const isValidURIFormat = URIFormats.some((format) =>
          new RegExp(format).test(value),
        );
        if (!allowUris) {
          return "URIs are not allowed, please use a URL instead.";
        }
        if (!isValidURIFormat) {
          return "Invalid PHID format. Please use one of the following formats: phd:uuid, phd:uuid:branch, phd:uuid::scope, or phd:uuid:branch:scope";
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
