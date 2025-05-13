import {
  Select,
  type SelectProps,
} from "../../../../ui/components/data-entry/select/index.js";
import type { FieldErrorHandling } from "../../types.js";
import { withFieldValidation } from "../with-field-validation/index.js";

type SelectFieldProps = SelectProps & FieldErrorHandling;

const SelectField = withFieldValidation<SelectFieldProps>(Select);

SelectField.displayName = "SelectField";

export { SelectField, type SelectFieldProps };
