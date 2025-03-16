import { type IconName } from "#powerhouse";
import React, { useCallback, useId, useMemo } from "react";
import { sharedValueTransformers } from "../../lib/shared-value-transformers.js";
import { cn } from "../../lib/utils.js";
import {
    FormDescription,
    FormGroup,
    FormLabel,
    FormMessageList,
    Input,
} from "../fragments/index.js";
import ValueTransformer from "../fragments/value-transformer/index.js";
import type { InputBaseProps } from "../types.js";
import UrlFavicon from "./url-favicon.js";
import { useURLWarnings } from "./useURLWarnings.js";

type PlatformIcon = IconName | React.ReactElement;

interface UrlInputProps
  extends InputBaseProps<string>,
    // FieldErrorHandling,
    Omit<
      React.InputHTMLAttributes<HTMLInputElement>,
      "pattern" | "value" | "defaultValue" | "name" | "maxLength"
    > {
  showWarnings?: boolean;
  platformIcons?: Record<string, PlatformIcon>;
}

const UrlInput = React.forwardRef<HTMLInputElement, UrlInputProps>(
  (
    {
      label,
      description,
      showWarnings = true,
      warnings: warningsProp,
      errors,
      platformIcons,
      value,
      onBlur,

      ...props
    },
    ref,
  ) => {
    const idGenerated = useId();
    const id = props.id ?? idGenerated;
    const hasError = !!errors?.length;
    const { warnings, checkForWarnings } = useURLWarnings(value ?? "");
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

    const handleWarningsOnEnter = useCallback(
      (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
          checkForWarnings();
        }
      },
      [checkForWarnings],
    );

    // prevent url from having trailing spaces
    const transformers = useMemo(
      () => [sharedValueTransformers.trimOnBlur()],
      [],
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
          <ValueTransformer transformers={transformers}>
            <Input
              id={id}
              ref={ref}
              type="url"
              {...props}
              value={value ?? ""}
              onBlur={handleBlur}
              onKeyDown={handleWarningsOnEnter}
              aria-invalid={hasError}
              className={cn(showIcon && "pl-8")}
              data-cast="URLTrim"
            />
          </ValueTransformer>
          <UrlFavicon url={value ?? ""} platformIcons={platformIcons} />
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

UrlInput.displayName = "UrlInput";

export { UrlInput, type PlatformIcon, type UrlInputProps };

