import React, { useCallback, useState } from "react";
import { DateFieldValue } from "./types";
import { format, isValid } from "date-fns";
import { createChangeEvent } from "@/scalars/lib/utils";
interface DatePickerFieldProps {
  value?: DateFieldValue;
  defaultValue?: DateFieldValue;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const useDatePickerField = ({
  value,
  defaultValue,
  onChange,
}: DatePickerFieldProps) => {
  const [date, setDate] = useState<Date>();
  const [inputValue, setInputValue] = useState(value ?? defaultValue ?? "");
  const [isOpen, setIsOpen] = React.useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    const changeEvent = createChangeEvent(e.target.value);
    onChange?.(changeEvent);
  };

  const handleDateSelect = useCallback(
    (date?: Date) => {
      setDate(date);
      if (date) {
        setInputValue(format(date, "MM/dd/yyyy"));
        const changeEvent = createChangeEvent(format(date, "MM/dd/yyyy"));
        onChange?.(changeEvent);
      } else {
        setInputValue("");
      }
    },
    [onChange],
  );
  const formatDate = React.useCallback((value: DateFieldValue): string => {
    if (!value) return "";

    if (typeof value === "string") {
      return value;
    }

    if (typeof value === "object" && isValid(value)) {
      return format(value, "dd/MM/yyyy");
    }
    return "";
  }, []);

  return {
    date,
    inputValue,
    handleDateSelect,
    handleInputChange,
    isOpen,
    setIsOpen,
    formatDate,
  };
};
