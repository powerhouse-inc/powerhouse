import { withFieldValidation } from "../fragments/with-field-validation/with-field-validation.js";
import type { FieldErrorHandling } from "../types.js";
import { UrlInput, type UrlInputProps } from "./url-input.js";

interface UrlFieldProps extends UrlInputProps, FieldErrorHandling {
  allowedProtocols?: string[];
  maxURLLength?: number;
}

const UrlField = withFieldValidation<UrlFieldProps>(UrlInput, {
  validations: {
    _validUrl: () => (value) => {
      if (!value) return true;
      try {
        const url = new URL(value as string);
        const regex =
          /^(([0-9]{1,3}\.){3}[0-9]{1,3})|(([a-z0-9-_]+\.)+[a-z]{2,})|(localhost)$/i;
        if (!regex.test(url.hostname)) {
          return `${value} must be a valid URL`;
        }
        return true;
      } catch {
        return `${value} must be a valid URL`;
      }
    },
    _allowedProtocols:
      ({ allowedProtocols }) =>
      (value) => {
        if (!value || !allowedProtocols) return true;
        try {
          const url = new URL(value as string);
          const isAllowed = allowedProtocols.includes(
            url.protocol.slice(0, -1),
          );
          if (isAllowed) return true;
        } catch {
          return true; // handling valid url is handled by _validUrl validation
        }

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

UrlField.displayName = "UrlField";

export { UrlField, type UrlFieldProps };
