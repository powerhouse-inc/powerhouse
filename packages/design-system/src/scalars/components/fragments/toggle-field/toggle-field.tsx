import { withFieldValidation } from "../with-field-validation/with-field-validation.js";
import { Toggle, type ToggleProps } from "./toggle.js";

const ToggleField = withFieldValidation<ToggleProps>(Toggle);

ToggleField.displayName = "ToggleField";

export { ToggleField };
