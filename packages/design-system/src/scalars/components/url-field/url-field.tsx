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

interface UrlFieldProps
  extends FieldCommonProps<string>,
    ErrorHandling,
    Omit<
      React.InputHTMLAttributes<HTMLInputElement>,
      "pattern" | "value" | "defaultValue" | "name"
    > {
  allowedProtocols?: string[];
}

const UrlFieldRaw: React.FC<UrlFieldProps> = ({
  label,
  description,
  warnings,
  errors,
  allowedProtocols = ["http", "https"],
  ...props
}) => {
  const idGenerated = useId();
  const id = props.id ?? idGenerated;

  const showProtocol = allowedProtocols.length > 1;
  const protocol = `${allowedProtocols[0] ?? "https"}://`;

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
      <div className={"flex items-center"}>
        {showProtocol && (
          <Input
            value={protocol}
            readOnly
            // tailwind does not support dynamic classes
            style={{ width: `${(protocol.length + 1) * 8}px` }}
            className={`w-auto rounded-r-none border-r-0 focus:z-10`}
          />
        )}
        <Input
          id={id}
          type="url"
          role="textbox"
          {...props}
          value={props.value ?? ""} // make sure it doesn't change from uncontrolled to controlled
          className={cn("focus:z-10", showProtocol && "rounded-l-none")}
        />
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
        return "Invalid URL";
      }
    },
    _allowedProtocols:
      ({ allowedProtocols }) =>
      (value) => {
        if (!value || !allowedProtocols) return true;

        const url = new URL(value as string);
        const isAllowed = allowedProtocols.includes(url.protocol.slice(0, -1));
        return isAllowed ? true : "Invalid protocol";
      },
  },
});
