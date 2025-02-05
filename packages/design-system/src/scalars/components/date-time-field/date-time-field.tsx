import React from "react";
import { FieldCommonProps } from "../types";
import { DateFieldValue } from "../date-picker-field/types";
import { DatePickerField } from "../date-picker-field/date-picker-field";
import { TimePickerField } from "../time-picker-field";
interface DateTimeFieldProps extends FieldCommonProps<DateFieldValue> {
  showDateSelect?: boolean;
  showTimeSelect?: boolean;
  name: string;
  label?: string;
}

export const DateTimeField: React.FC<DateTimeFieldProps> = ({
  showDateSelect = true,
  showTimeSelect = true,
  name,
  label,
  ...props
}) => {
  if (!showDateSelect && !showTimeSelect) {
    return <DatePickerField name={name} label={label} {...props} />;
  }

  return (
    <div>
      {showDateSelect && showTimeSelect && (
        <div>
          {/* TODO: Implement DateTimePicker */}
          <div>Placeholder DateTimePicker</div>
        </div>
      )}
      {showDateSelect && !showTimeSelect && (
        <DatePickerField name={name} label={label} {...props} />
      )}
      {!showDateSelect && showTimeSelect && <TimePickerField name={name} />}
    </div>
  );
};
