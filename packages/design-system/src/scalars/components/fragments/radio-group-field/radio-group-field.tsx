import {
  RadioGroup,
  type RadioGroupProps,
} from "../../../../ui/components/data-entry/radio-group/index.js";
import type { FieldErrorHandling } from "../../types.js";
import { withFieldValidation } from "../with-field-validation/index.js";

type RadioGroupFieldProps = RadioGroupProps & FieldErrorHandling;

const RadioGroupField = withFieldValidation<RadioGroupFieldProps>(RadioGroup);

RadioGroupField.displayName = "RadioGroupField";

export { RadioGroupField, type RadioGroupFieldProps };
