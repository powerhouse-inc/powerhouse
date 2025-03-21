import {
  TimePicker,
  type TimePickerProps,
} from "../../../ui/components/data-entry/time-picker/time-picker.js";
import { withFieldValidation } from "../fragments/with-field-validation/with-field-validation.js";
import { type FieldErrorHandling } from "../types.js";
import { validateTimePicker } from "./time-picker-field-validations.js";

interface TimeFieldProps extends TimePickerProps, FieldErrorHandling {}

const TimePickerField = withFieldValidation<TimeFieldProps>(TimePicker, {
  validations: {
    _timePickerType: validateTimePicker,
  },
});

TimePickerField.displayName = "TimePickerField";

export { TimePickerField, type TimeFieldProps };
