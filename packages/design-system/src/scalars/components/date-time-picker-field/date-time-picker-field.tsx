import {
  DateTimePicker,
  DateTimePickerProps,
} from "../../../ui/components/data-entry/date-time-picker/date-time-picker.js";
import { withFieldValidation } from "../fragments/with-field-validation/with-field-validation.js";
import { type FieldErrorHandling } from "../types.js";
import { dateTimeFieldValidations } from "./date-time-picker-field-validations.js";

interface DateTimePickerFieldProps
  extends DateTimePickerProps,
    FieldErrorHandling {}

const DateTimePickerField = withFieldValidation<DateTimePickerFieldProps>(
  DateTimePicker,
  {
    validations: {
      _timePickerType: dateTimeFieldValidations,
    },
  },
);

DateTimePickerField.displayName = "DateTimePickerField";

export { DateTimePickerField, type DateTimePickerFieldProps };
