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
import { IconName } from "@/powerhouse";
import { useURLWarnings } from "./useURLWarnings";
import UrlFavicon from "./url-favicon";

export type PlatformIcon = IconName | React.ReactElement;

interface UrlFieldProps
  extends FieldCommonProps<string>,
    ErrorHandling,
    Omit<
      React.InputHTMLAttributes<HTMLInputElement>,
      "pattern" | "value" | "defaultValue" | "name"
    > {
  allowedProtocols?: string[];
  maxURLLength?: number;
  showWarnings?: boolean;
  platformIcons?: Record<string, PlatformIcon>;
}

const UrlFieldRaw: React.FC<UrlFieldProps> = React.forwardRef<
  HTMLInputElement,
  UrlFieldProps
>(
  (
    {
      label,
      description,
      showWarnings = true,
      warnings: warningsProp,
      errors,
      platformIcons,
      onBlur,

      // these are not used in the component but are required by the withFieldValidation HOC
      // declared to avoid forwarding them to the input in the "props" spread
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      allowedProtocols,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      maxURLLength,

      ...props
    },
    ref,
  ) => {
    const idGenerated = useId();
    const id = props.id ?? idGenerated;
    const hasError = !!errors?.length;
    const { warnings, checkForWarnings } = useURLWarnings(props.value ?? "");
    const showIcon = Object.keys(platformIcons ?? {}).length > 0;

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
            ref={ref}
            type="url"
            {...props}
            value={props.value ?? ""}
            aria-invalid={hasError}
            onBlur={handleBlur}
            className={cn(showIcon && "pl-8")}
          />
          <UrlFavicon url={props.value ?? ""} platformIcons={platformIcons} />
        </div>
        {description && <FormDescription>{description}</FormDescription>}
        {showWarnings && combinedWarnings.length > 0 && (
          <FormMessageList messages={combinedWarnings} type="warning" />
        )}
        {errors && <FormMessageList messages={errors} type="error" />}
      </FormGroup>
    );
  },
);

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
