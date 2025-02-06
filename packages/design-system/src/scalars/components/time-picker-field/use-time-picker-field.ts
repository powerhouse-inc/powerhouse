import { format, getHours, getMinutes, isValid, parse } from "date-fns";
import React, { useMemo, useState } from "react";
import { TimeFieldValue } from "./type";
import { createChangeEvent } from "./utils";

interface TimePickerFieldProps {
  value?: TimeFieldValue;
  defaultValue?: TimeFieldValue;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  timeFormat?: string;
}

export const useTimePickerField = ({
  value,
  defaultValue,
  onChange,
  onBlur,
  timeFormat = "hh:mm a",
}: TimePickerFieldProps) => {
  const now = new Date();
  const currentHour = getHours(now);
  const currentMinute = getMinutes(now);

  // Determine if the format is 12-hour or 24-hour
  const is12HourFormat = timeFormat.includes("a");

  // Initialize the hour and minutes according to the format
  const initialHour = is12HourFormat
    ? String(currentHour % 12 || 12).padStart(2, "0")
    : String(currentHour).padStart(2, "0");

  const initialMinute = String(currentMinute).padStart(2, "0");
  const initialPeriod = is12HourFormat
    ? currentHour >= 12
      ? "PM"
      : "AM"
    : undefined;

  const [selectedHour, setSelectedHour] = useState(initialHour);
  const [selectedMinute, setSelectedMinute] = useState(initialMinute);
  const [selectedPeriod, setSelectedPeriod] = useState<"AM" | "PM" | undefined>(
    initialPeriod,
  );

  const inputValue = value ?? defaultValue ?? "";
  const [isOpen, setIsOpen] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    onBlur?.(e);
  };

  // Generate hours according to the format
  const hours = is12HourFormat
    ? Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")) // 1-12
    : Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")); // 0-23

  // Generate minutes (0-59)
  const minutes = Array.from({ length: 60 }, (_, i) =>
    String(i).padStart(2, "0"),
  );

  const handleSave = () => {
    let timeString: string;

    if (is12HourFormat) {
      timeString = `${selectedHour}:${selectedMinute} ${selectedPeriod}`;
    } else {
      // 24-hour format: does not include AM/PM
      timeString = `${selectedHour}:${selectedMinute}`;
    }

    // Parse and format the time according to the specified format
    const parsedTime = parse(timeString, timeFormat, new Date());

    const formattedTime = format(parsedTime, timeFormat);

    setIsOpen(false);
    onChange?.(createChangeEvent(formattedTime));
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const getTimeZoneOffset = (timeZone: string) => {
    const date = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    });

    const parts = formatter.formatToParts(date);
    const offsetPart = parts.find((part) => part.type === "timeZoneName");
    return offsetPart ? offsetPart.value : "";
  };

  const timeZonesOptions = useMemo(() => {
    const timeZones = Intl.supportedValuesOf("timeZone");
    return timeZones.map((timeZone) => {
      const offset = getTimeZoneOffset(timeZone);
      const label = `(${offset}) ${timeZone.replace(/_/g, " ")}`;
      return { value: timeZone, label };
    });
  }, []);

  return {
    selectedHour,
    selectedMinute,
    selectedPeriod,
    setSelectedHour,
    setSelectedMinute,
    setSelectedPeriod,
    hours,
    minutes,
    inputValue,
    handleInputChange,
    isOpen,
    setIsOpen,
    handleCancel,
    handleSave,
    timeZonesOptions,
    handleBlur,
    timeFormat,
  };
};
