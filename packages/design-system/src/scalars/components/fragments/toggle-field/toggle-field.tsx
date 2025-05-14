import {
  Toggle,
  type ToggleProps,
} from "../../../../ui/components/data-entry/toggle/toggle.js";
import { type WithDifference } from "../../types.js";
import { withFieldValidation } from "../with-field-validation/with-field-validation.js";

export type ToggleFieldProps = ToggleProps & WithDifference<boolean>;

const ToggleField = withFieldValidation<ToggleFieldProps>(Toggle);

ToggleField.displayName = "ToggleField";

export { ToggleField };
