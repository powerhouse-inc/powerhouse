import React, { useMemo, useState } from "react";
import { TimeFieldValue, TimePeriod } from "./type";
import {
  cleanTime,
  getOffsetToDisplay,
  convert12hTo24h,
  createChangeEvent,
  formatInputToDisplayValid,
  formatInputsToValueFormat,
  getHours,
  getHoursAndMinutes,
  getInputValue,
  getMinutes,
  getOffset,
  getOptions,
  getTimezone,
  isValidTimeInput,
} from "./utils";
export const convertTimeFrom24To12Hours = (time: string) => {
  if (time === "") return "";
  const hours = Number(time);
  if (isNaN(hours)) return "";
  return String(hours % 12 || 12).padStart(2, "0");
};
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
  const [isOpen, setIsOpen] = useState(false);
  const is12HourFormat = timeFormat.includes("a");
  const [inputValue, setInputValue] = useState(
    getInputValue(value ?? defaultValue),
  );

  const [selectedHour, setSelectedHour] = useState(
    is12HourFormat
      ? convertTimeFrom24To12Hours(getHours(value ?? defaultValue ?? ""))
      : getHours(value ?? defaultValue ?? ""),
  );

  const [selectedMinute, setSelectedMinute] = useState(
    getMinutes(value ?? defaultValue ?? ""),
  );

  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod | undefined>(
    undefined,
  );

  const [selectedTimeZone, setSelectedTimeZone] = useState<
    string | string[] | undefined
  >(getTimezone(value ?? defaultValue ?? ""));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    setInputValue(input);
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const input = e.target.value;

    if (!isValidTimeInput(input)) {
      if (input === "") {
        setInputValue(input);
        onChange?.(createChangeEvent(""));
        onBlur?.(e);
        return;
      }
      const inValid = formatInputsToValueFormat("99", "99", "±09:09");
      setInputValue(input);
      onChange?.(createChangeEvent(inValid));
      onBlur?.(e);
      return;
    }
    const validDisplay = formatInputToDisplayValid(
      input,
      is12HourFormat,
      dateIntervals,
      selectedPeriod,
    );
    setInputValue(validDisplay);

    const validValue = convert12hTo24h(validDisplay);

    const { minutes, hours, period } = getHoursAndMinutes(validValue);

    const offsetUTC = getOffset(selectedTimeZone as string);

    if (is12HourFormat) {
      setSelectedPeriod(period as TimePeriod);
    }

    const datetime = formatInputsToValueFormat(hours, minutes, offsetUTC);
    const clearMinutes = cleanTime(minutes);
    const clearHours = convertTimeFrom24To12Hours(cleanTime(hours));
    setSelectedHour(clearHours);
    setSelectedMinute(clearMinutes);
    onChange?.(createChangeEvent(datetime));
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
      return arr;
    }
    return Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
  }, [dateIntervals]);

  const handleSave = () => {
    setIsOpen(false);
    const offsetUTC = getOffset(selectedTimeZone as string);

    // Value to save in the onSubmin
    const datetime = formatInputsToValueFormat(
      selectedHour,
      selectedMinute,
      offsetUTC,
    );
    // Value to display in the input
    const validDisplay = formatInputToDisplayValid(
      datetime,
      is12HourFormat,
      dateIntervals,
      selectedPeriod,
    );
    setInputValue(validDisplay);
    onChange?.(createChangeEvent(datetime));
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const options = useMemo(() => {
    return getOptions();
  }, []);

  // if timeZone, then the options of select will be that timeZone and the offset
  const isDisableSelect = timeZone || !showTimezoneSelect ? true : false;
  const timeZonesOptions = timeZone
    ? [
        options.find((opt) => opt.value === timeZone) || {
          label: `(${getOffsetToDisplay(timeZone)}) ${timeZone.replace(/_/g, " ")}`,
          value: timeZone,
        },
      ]
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
