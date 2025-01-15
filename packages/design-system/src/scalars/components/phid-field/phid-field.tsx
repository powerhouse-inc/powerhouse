import React, { useId } from "react";
import { FormGroup } from "@/scalars/components/fragments/form-group";
import { FormLabel } from "@/scalars/components/fragments/form-label";
import { FormDescription } from "@/scalars/components/fragments/form-description";
import { FormMessageList } from "@/scalars/components/fragments/form-message";
import { Input } from "@/scalars/components/fragments/input";
import { ListItem } from "./list-item";
import { withFieldValidation } from "@/scalars/components/fragments/with-field-validation";
import { cn } from "@/scalars/lib/utils";
import { FieldCommonProps, ErrorHandling } from "@/scalars/components/types";
import { PHIDProps } from "./types";

export type PHIDFieldProps = FieldCommonProps<string> &
  ErrorHandling &
  PHIDProps;

const PHIDFieldRaw: React.FC<PHIDFieldProps> = React.forwardRef<
  HTMLInputElement,
  PHIDFieldProps
>(
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
      autoComplete,
      errors,
      warnings,
      onChange,
      defaultBranch = "main",
      defaultScope = "public",
      allowedScopes,
      allowedDocumentTypes,
      allowUris,
      enableAutoComplete = true,
      allowDataObjectReference = false,
      selectedOptionVariant = "withPHID",
      minLength,
      maxLength,
      ...props
    },
    ref,
  ) => {
    const prefix = useId();
    const id = idProp ?? `${prefix}-phid`;

    return (
      <FormGroup>
        {label && (
          <FormLabel
            htmlFor={id}
            disabled={disabled}
            hasError={Array.isArray(errors) && errors.length > 0}
            required={required}
          >
            {label}
          </FormLabel>
        )}
        {/* TODO: Implement an accessible autocomplete/dropdown list by reusing Popover + cmdk based components */}
        <Input
          id={id}
          name={name}
          className={className}
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          {...props}
          autoComplete={enableAutoComplete ? "off" : autoComplete}
          ref={ref}
        />
        {enableAutoComplete && value && value.length > 0 && (
          <div
            className={cn(
              "fixed top-[100px] z-10 flex max-h-[300px] w-[280px] flex-col gap-2 overflow-y-auto bg-white dark:bg-gray-900",
            )}
          >
            <ListItem />
            <ListItem />
            <ListItem />
          </div>
        )}
        {description && <FormDescription>{description}</FormDescription>}
        {Array.isArray(warnings) && (
          <FormMessageList messages={warnings} type="warning" />
        )}
        {Array.isArray(errors) && (
          <FormMessageList messages={errors} type="error" />
        )}
      </FormGroup>
    );
  },
);

export const PHIDField = withFieldValidation<PHIDFieldProps>(PHIDFieldRaw, {
  validations: {
    _validPHIDFormat:
      ({ allowUris, allowedScopes }) =>
      (value: string | undefined) => {
        if (!value) return true;

        // PHID format regex patterns
        const uuidPattern =
          "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
        const branchPattern = "[a-zA-Z0-9][a-zA-Z0-9-/]*[a-zA-Z0-9]"; // Until PH defines the pattern to be used
        const scopePattern = "[a-zA-Z0-9][a-zA-Z0-9-/]*[a-zA-Z0-9]"; // Until PH defines the pattern to be used

        // Different valid formats
        const URIFormats = [
          `^phd:${uuidPattern}$`,
          `^phd:${uuidPattern}:${branchPattern}$`,
          `^phd:${uuidPattern}::${scopePattern}$`,
          `^phd:${uuidPattern}:${branchPattern}:${scopePattern}$`,
        ];

        const isValidURIFormat = URIFormats.some((format) =>
          new RegExp(format).test(value),
        );
        if (!allowUris && isValidURIFormat) {
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
