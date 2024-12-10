import React, { useCallback, useId, useMemo } from "react";
import {
  Input,
  FormGroup,
  withFieldValidation,
  FormLabel,
  FormDescription,
  FormMessageList,
} from "../fragments";
import { ErrorHandling, FieldCommonProps } from "../types";
import { cn } from "@/scalars/lib";
import { Icon } from "@/powerhouse";
import { getIconName } from "./utils";
import { useURLWarnings } from "./useURLWarnings";

interface UrlFieldProps
  extends FieldCommonProps<string>,
    ErrorHandling,
    Omit<
      React.InputHTMLAttributes<HTMLInputElement>,
      "pattern" | "value" | "defaultValue" | "name"
    > {
  allowedProtocols?: string[];
  maxURLLength?: number;
  showIcon?: boolean;
}

const UrlFieldRaw: React.FC<UrlFieldProps> = ({
  label,
  description,
  warnings: warningsProp,
  errors,
  showIcon = false,
  onBlur,
  ...props
}) => {
  const idGenerated = useId();
  const id = props.id ?? idGenerated;
  const hasError = !!errors?.length;
  const { warnings, checkForWarnings } = useURLWarnings(props.value ?? "");

  const combinedWarnings = useMemo(() => {
    return [...(warningsProp ?? []), ...warnings];
  }, [warningsProp, warnings]);

  const handleBlur = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      checkForWarnings();
      onBlur?.(event);
    },
    [checkForWarnings, onBlur],
  );

  return (
    <FormGroup>
      <FormLabel
        htmlFor={id}
        required={props.required}
        disabled={props.disabled}
        hasError={!!errors?.length}
      >
        {label}
      </FormLabel>
      <div className="relative">
        <Input
          id={id}
          type="url"
          {...props}
          value={props.value ?? ""}
          aria-invalid={hasError}
          onBlur={handleBlur}
          className={cn(showIcon && "pl-8")}
        />
        {showIcon && (
          <div className="absolute left-2.5 top-0 flex h-full items-center justify-center text-gray-900">
            <Icon name={getIconName(props.value ?? "")} size={18} />
          </div>
        )}
      </div>
      {description && <FormDescription>{description}</FormDescription>}
      {combinedWarnings.length > 0 && (
        <FormMessageList messages={combinedWarnings} type="warning" />
      )}
      {errors && <FormMessageList messages={errors} type="error" />}
    </FormGroup>
  );
};

export const UrlField = withFieldValidation<UrlFieldProps>(UrlFieldRaw, {
  validations: {
    _validUrl: () => (value) => {
      if (!value) return true;
      try {
        new URL(value as string);
        return true;
      } catch {
        return `${value} must be a valid URL`;
      }
    },
    _allowedProtocols:
      ({ allowedProtocols }) =>
      (value) => {
        if (!value || !allowedProtocols) return true;

        const url = new URL(value as string);
        const isAllowed = allowedProtocols.includes(url.protocol.slice(0, -1));
        if (isAllowed) return true;

        let allowedProtocolsString = allowedProtocols.join(", ");
        if (allowedProtocols.length > 1) {
          allowedProtocolsString = allowedProtocolsString.replace(
            /,\s(?=[^,]*$)/,
            " or ",
          );
        }

        return `The URL must start with ${allowedProtocolsString}`;
      },
    _maxURLLength:
      ({ maxURLLength, label }) =>
      (value) => {
        if (!maxURLLength) return true;
        return (
          (value as string).length <= maxURLLength ||
          `${typeof label === "string" ? label : "URL"} must not exceed ${maxURLLength} characters`
        );
      },
  },
});
