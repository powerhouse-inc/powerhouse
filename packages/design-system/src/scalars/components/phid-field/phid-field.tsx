/* eslint-disable react/jsx-max-depth */
/* eslint-disable react/jsx-no-bind */
/* eslint-disable react/jsx-props-no-spreading */
import React, { useId } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Icon } from "@/powerhouse/components/icon";
import { Command } from "@/scalars/components/fragments/command";
import { Input } from "@/scalars/components/fragments/input";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/scalars/components/fragments/popover";
import { FormGroup } from "@/scalars/components/fragments/form-group";
import { FormLabel } from "@/scalars/components/fragments/form-label";
import {
  Tooltip,
  TooltipProvider,
} from "@/scalars/components/fragments/tooltip";
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
      onClick,
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

    const {
      selectedValue,
      isPopoverOpen,
      commandListRef,
      options,
      isLoading,
      haveFetchError,
      toggleOption,
      handleOpenChange,
      onTriggerBlur,
      handleChange,
    } = usePHIDField({
      autoComplete,
      defaultValue,
      value,
      onChange,
      onBlur,
    });

    const selectedOption = options.find((opt) => opt.phid === selectedValue);
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
        <Popover
          open={!haveFetchError && isPopoverOpen}
          onOpenChange={handleOpenChange}
        >
          <Command
            shouldFilter={false}
            className={cn(
              asCard && [
                "group rounded-md",
                "dark:focus-within:ring-charcoal-300 focus-within:ring-1 focus-within:ring-gray-900 focus-within:ring-offset-0",
              ],
            )}
          >
            <PopoverAnchor asChild={true}>
              <div className="relative">
                <CommandPrimitive.Input asChild>
                  <Input
                    id={id}
                    name={name}
                    value={selectedValue}
                    className={cn(
                      asCard &&
                        "rounded-b-none border-b-0 focus-visible:ring-0",
                      haveFetchError && "pr-9",
                      className,
                    )}
                    disabled={disabled}
                    onChange={handleChange}
                    onBlur={onTriggerBlur}
                    onClick={(e) => {
                      const input = e.target as HTMLInputElement;
                      if (
                        !options.some((opt) => opt.phid === input.value) &&
                        input.value !== ""
                      ) {
                        handleOpenChange(true);
                      }
                      onClick?.(e);
                    }}
                    onMouseDown={(e) => {
                      const input = e.target as HTMLInputElement;
                      if (!input.contains(document.activeElement)) {
                        // wait for the next tick to ensure the focus occurs first
                        requestAnimationFrame(() => {
                          input.select();
                        });
                      }
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
                {haveFetchError && (
                  <div
                    className={cn(
                      "absolute right-3 top-1/2 flex -translate-y-1/2 items-center",
                    )}
                  >
                    <TooltipProvider>
                      <Tooltip content="Network error">
                        <Icon
                          name="Error"
                          size={16}
                          className={cn("text-red-900")}
                        />
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
              </div>
            </PopoverAnchor>
            {asCard && (
              <PHIDListItem
                variant={variant}
                title={selectedOption?.title}
                path={selectedOption?.path}
                phid=""
                description={selectedOption?.description}
                asPlaceholder={selectedOption === undefined}
                className={cn(
                  "rounded-t-none border border-gray-300 border-t-transparent bg-gray-100 pt-2",
                  "dark:border-charcoal-700 dark:border-t-transparent dark:bg-slate-600",
                  "dark:group-focus-within:border-t-charcoal-700 group-focus-within:border-t-gray-300",
                )}
              />
            )}
            <PopoverContent
              align="start"
              className={cn(
                "w-[--radix-popover-trigger-width] p-0",
                "border-gray-300 bg-white dark:border-slate-500 dark:bg-slate-600",
                "rounded-md shadow-[1px_4px_15px_0px_rgba(74,88,115,0.25)] dark:shadow-[1px_4px_15.3px_0px_#141921]",
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
                isLoading={isLoading}
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

        // URL pattern
        // Domain segments can start/end with alphanumeric and contain hyphens
        // Multiple segments separated by dots are allowed (e.g., sub.domain.com)
        const domainSegment = "[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?";
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
