import React from "react";
import DatePickerField from "../date-picker-field/date-picker-field";
import TimePickerField from "../time-picker-field/time-picker-field";

interface DateTimeFieldProps {
  showDateSelect?: boolean;
  showTimeSelect?: boolean;
}

export const DateTimeField: React.FC<DateTimeFieldProps> = ({
  showDateSelect = true,
  showTimeSelect = true,
}) => {
  if (!showDateSelect && !showTimeSelect) {
    return <DatePickerField />;
  }

  return (
    <div>
      {showDateSelect && showTimeSelect && (
        <div>
          <div>Placeholder DateTimePicker</div>
        </div>
      )}
      {showDateSelect && !showTimeSelect && <DatePickerField />}
      {!showDateSelect && showTimeSelect && <TimePickerField />}
    </div>
  );
};
