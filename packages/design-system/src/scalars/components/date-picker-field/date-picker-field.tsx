import React, { forwardRef } from "react";
import { FieldCommonProps } from "../types";
import { DateFieldValue } from "./types";
import { FormGroup, FormLabel } from "../fragments";

export interface DatePickerFieldProps extends FieldCommonProps<DateFieldValue> {
  label?: string;
  id?: string;
  name: string;
  disabled?: boolean;
  required?: boolean;
}

const DatePickerField = forwardRef<HTMLDivElement, DatePickerFieldProps>(
  // We need to pass the name prop to the DatePicker component
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ({ label, id, errors, name, disabled, required, ...props }, ref) => {
    return (
      <FormGroup>
        {label && (
          <FormLabel
            htmlFor={id}
            required={required}
            disabled={disabled}
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

export default DatePickerField;
