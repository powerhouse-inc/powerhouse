import {
  Checkbox,
  type CheckboxProps,
} from "../../../../ui/components/data-entry/checkbox/checkbox.js";
import { withFieldValidation } from "../with-field-validation/with-field-validation.js";

const CheckboxField = withFieldValidation<CheckboxProps>(Checkbox);

CheckboxField.displayName = "CheckboxField";

export { CheckboxField };
