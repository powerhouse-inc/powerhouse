import { OIDInput } from "../../../ui/components/data-entry/oid-input/index.js";
import { withFieldValidation } from "../fragments/with-field-validation/index.js";
import type { OIDFieldProps } from "./types.js";

const OIDField = withFieldValidation<OIDFieldProps>(OIDInput, {
  validations: {
    _validOIDFormat: () => (value: string | undefined) => {
      if (value === "" || value === undefined) {
        return true;
      }

      const uuidPattern =
        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

      const isValidUUID = new RegExp(uuidPattern).test(value);
      if (!isValidUUID) {
        return "Invalid uuid format. Please enter a valid uuid v4.";
      }

      return true;
    },
  },
});

OIDField.displayName = "OIDField";

export { OIDField };
