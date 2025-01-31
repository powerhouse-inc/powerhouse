import React from "react";
import { DateFieldValue } from "./types";
import { format, isValid } from "date-fns";

interface DatePickerFieldProps {
  value?: DateFieldValue;
  defaultValue?: DateFieldValue;
}

export const useDatePickerField = ({
  value,
  defaultValue,
}: DatePickerFieldProps) => {
  const [date, setDate] = React.useState<Date>();
  const [inputValue, setInputValue] = React.useState(
    value ?? defaultValue ?? "",
  );
  const [isOpen, setIsOpen] = React.useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  function handleDateSelect(date?: Date) {
    setDate(date);
    if (date) {
      setInputValue(format(date, "MM/dd/yyyy"));
    } else {
      setInputValue("");
    }
  }
  const formatDate = (value: DateFieldValue): string => {
    if (!value) return "";

    if (typeof value === "string") {
      return value;
    }

    if (typeof value === "object" && isValid(value)) {
      return format(value, "dd/MM/yyyy");
    }
    return "";
  };

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
