import React, { forwardRef } from "react";
import { FormGroup, FormLabel } from "../fragments";
import { FieldCommonProps } from "../types";
import { TimeFieldValue } from "./type";
interface TimePickerFieldProps extends FieldCommonProps<TimeFieldValue> {
  label?: string;
  id?: string;
  name: string;
}

const TimePickerField = forwardRef<HTMLDivElement, TimePickerFieldProps>(
  // We need to pass the name prop to the TimePicker component
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ({ label, id, errors, name, ...props }, ref) => {
    return (
      <FormGroup>
        {label && (
          <FormLabel
            htmlFor={id}
            required={props.required}
            disabled={props.disabled}
            hasError={!!errors?.length}
          >
            {label}
          </FormLabel>
        )}
        <div ref={ref}>
          <div>Placeholder DatePicker</div>
        </div>
      </FormGroup>
    );
  },
);

export default TimePickerField;
