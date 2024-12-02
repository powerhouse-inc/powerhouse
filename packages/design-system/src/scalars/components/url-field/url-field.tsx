import React, { useId } from "react";
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

interface UrlFieldProps
  extends FieldCommonProps<string>,
    ErrorHandling,
    Omit<
      React.InputHTMLAttributes<HTMLInputElement>,
      "pattern" | "value" | "defaultValue" | "name"
    > {
  allowedProtocols?: string[];
  showIcon?: boolean;
}

const UrlFieldRaw: React.FC<UrlFieldProps> = ({
  label,
  description,
  warnings,
  errors,
  showIcon = false,
  ...props
}) => {
  const idGenerated = useId();
  const id = props.id ?? idGenerated;

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
          className={cn(showIcon && "pl-8")}
        />
        {showIcon && (
          <div className="absolute left-2.5 top-0 flex h-full items-center justify-center text-gray-900">
            <Icon name={getIconName(props.value ?? "")} size={18} />
          </div>
        )}
      </div>
      {description && <FormDescription>{description}</FormDescription>}
      {warnings && <FormMessageList messages={warnings} type="warning" />}
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
  },
});
