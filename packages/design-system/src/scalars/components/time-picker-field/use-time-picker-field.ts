import { format, getHours, getMinutes, parse } from "date-fns";
import type React from "react";
import { useMemo, useState } from "react";
import { type TimeFieldValue } from "./type.js";
import {
  createChangeEvent,
  isValidTimeInput,
  roundMinute,
  transformInputTime,
} from "./utils.js";

interface TimePickerFieldProps {
  value?: TimeFieldValue;
  defaultValue?: TimeFieldValue;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  timeFormat?: string;
  dateIntervals?: number;
  timeZone?: string;
  showTimezoneSelect?: boolean;
}

export const useTimePickerField = ({
  value,
  defaultValue,
  onChange,
  onBlur,
  timeFormat = "hh:mm a",
  dateIntervals = 1,
  timeZone,
  showTimezoneSelect = true,
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
  const [selectedTimeZone, setSelectedTimeZone] = useState<
    string | string[] | undefined
  >();

  const inputValue = value ?? defaultValue ?? "";
  const [isOpen, setIsOpen] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const input = e.target.value;

    // If the transformation fails (empty values), do not make changes
    if (!isValidTimeInput(input)) {
      onBlur?.(e);
      return;
    }
    const { hour, minute, period } = transformInputTime(
      input,
      is12HourFormat,
      selectedPeriod,
    );

    const minuteNum = parseInt(minute, 10);
    const roundedMinute = roundMinute(minuteNum, dateIntervals);
    const formattedRoundedMinute = String(roundedMinute).padStart(2, "0");

    setSelectedHour(hour);
    setSelectedMinute(formattedRoundedMinute);
    if (is12HourFormat) {
      setSelectedPeriod(period);
    }

    const newTimeString = is12HourFormat
      ? `${hour}:${formattedRoundedMinute} ${period}`
      : `${hour}:${formattedRoundedMinute}`;

    onChange?.(createChangeEvent(newTimeString));
    onBlur?.(e);
  };

  // Generate hours according to the format
  const hours = is12HourFormat
    ? Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")) // 1-12
    : Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")); // 0-23

  const minutes = useMemo(() => {
    if (dateIntervals > 1) {
      const arr: string[] = [];
      for (let i = 0; i < 60; i += dateIntervals) {
        arr.push(String(i).padStart(2, "0"));
      }
      console.log(arr, dateIntervals);
      return arr;
    }
    return Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
  }, [dateIntervals]);
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

  const options = useMemo(() => {
    const timeZones = Intl.supportedValuesOf("timeZone");
    return timeZones.map((timeZone) => {
      const offset = getTimeZoneOffset(timeZone);
      const label = `(${offset}) ${timeZone.replace(/_/g, " ")}`;
      return { value: timeZone, label };
    });
  }, []);

  // if timeZone, then the options of select will be that timeZone and the offset
  const isDisableSelect = timeZone || !showTimezoneSelect ? true : false;
  const timeZonesOptions = timeZone
    ? [{ label: timeZone, value: timeZone }]
    : options;

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
    is12HourFormat,
    selectedTimeZone,
    setSelectedTimeZone,
    isDisableSelect,
  };
};
