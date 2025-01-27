import React from "react";
import DatePickerField from "../date-picker-field/date-picker-field";
import TimePickerField from "../time-picker-field/time-picker-field";
import { FieldCommonProps } from "../types";
import { DateFieldValue } from "../date-picker-field/types";
interface DateTimeFieldProps extends FieldCommonProps<DateFieldValue> {
  showDateSelect?: boolean;
  showTimeSelect?: boolean;
  name: string;
}

export const DateTimeField: React.FC<DateTimeFieldProps> = ({
  showDateSelect = true,
  showTimeSelect = true,
  name,
}) => {
  if (!showDateSelect && !showTimeSelect) {
    return <DatePickerField name={name} />;
  }

  return (
    <div>
      {showDateSelect && showTimeSelect && (
        <div>
          {/* TODO: Implement DateTimePicker */}
          <div>Placeholder DateTimePicker</div>
        </div>
      )}
      {showDateSelect && !showTimeSelect && <DatePickerField name={name} />}
      {!showDateSelect && showTimeSelect && <TimePickerField name={name} />}
    </div>
  );
};
