import React, { useState } from "react";
import { type DateFieldValue } from "../date-picker-field/types";
import { useTimePickerField } from "../time-picker-field/use-time-picker-field";
const parseDateTimeToInputValue = (value: DateFieldValue) => {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  });
};

interface DateTimeFieldProps {
  value?: DateFieldValue;
  defaultValue?: DateFieldValue;
  // Time Picker Field
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  timeFormat?: string;
  dateIntervals?: number;
  timeZone?: string;
  showTimezoneSelect?: boolean;
}

export const useDateTimePicker = ({
  value,
  defaultValue,
  // Time Picker Field
  onChange: onChangeTime,
  onBlur: onBlurTime,
  timeFormat = "hh:mm a",
  dateIntervals = 1,
  timeZone,
  showTimezoneSelect = true,
}: DateTimeFieldProps) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeTab, setActiveTab] = useState<"date" | "time">("date");

  // Logic for TimePicker
  const {
    selectedHour,
    selectedMinute,
    selectedPeriod,
    setSelectedHour,
    setSelectedMinute,
    setSelectedPeriod,
    hours,
    minutes,
  } = useTimePickerField({
    onChange: onChangeTime,
    onBlur: onBlurTime,
    timeFormat,
    dateIntervals,
    timeZone,
    showTimezoneSelect,
  });
  const onChangeTabs = (value: string) => {
    setActiveTab(value as "date" | "time");
  };
  const inputValue = parseDateTimeToInputValue(value ?? defaultValue ?? "");
  const isCalendarView = activeTab === "date";
  return {
    isOpen,
    setIsOpen,
    inputValue,
    activeTab,
    onChangeTabs,
    isCalendarView,
    // TimePicker Field
    selectedHour,
    selectedMinute,
    selectedPeriod,
    setSelectedHour,
    setSelectedMinute,
    setSelectedPeriod,
    hours,
    minutes,
  };
};
