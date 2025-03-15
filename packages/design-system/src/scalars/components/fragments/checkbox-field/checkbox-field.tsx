import { withFieldValidation } from "../with-field-validation/with-field-validation.js";
import { Checkbox, type CheckboxProps } from "./checkbox.js";

const CheckboxField = withFieldValidation<CheckboxProps>(Checkbox);

CheckboxField.displayName = "CheckboxField";

export { CheckboxField };
