import {
  Toggle,
  type ToggleProps,
} from "../../../../ui/components/data-entry/toggle/toggle.js";
import { withFieldValidation } from "../with-field-validation/with-field-validation.js";

const ToggleField = withFieldValidation<ToggleProps>(Toggle);

ToggleField.displayName = "ToggleField";

export { ToggleField };
