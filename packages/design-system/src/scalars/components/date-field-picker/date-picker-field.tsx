import {
  DatePicker,
  type DatePickerProps,
} from "../../../ui/components/data-entry/date-picker/date-picker.js";
import { withFieldValidation } from "../fragments/with-field-validation/with-field-validation.js";
import { type FieldErrorHandling } from "../types.js";
import { validateDatePicker } from "./date-validations.js";

interface DatePickerFieldProps extends DatePickerProps, FieldErrorHandling {}

const DatePickerField = withFieldValidation<DatePickerFieldProps>(DatePicker, {
  validations: {
    _timePickerType: validateDatePicker,
  },
});

DatePickerField.displayName = "DatePickerField";

export { DatePickerField, type DatePickerFieldProps };
