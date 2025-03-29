import type React from "react";
import { useMemo, useState } from "react";

import { createBlurEvent, getOffset } from "../date-time-picker/utils.js";
import { type TimeFieldValue, type TimePeriod } from "./type.js";
import {
  cleanTime,
  convert12hTo24h,
  createChangeEvent,
  formatInputToDisplayValid,
  formatInputsToValueFormat,
  getHours,
  getHoursAndMinutes,
  getInputValue,
  getMinutes,
  getOffsetToDisplay,
  getOptions,
  getTimezone,
  isValidTimeInput,
} from "./utils.js";

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
  timeIntervals?: number;
  timeZone?: string;
  showTimezoneSelect?: boolean;
  includeContinent?: boolean;
}

export const useTimePicker = ({
  value,
  defaultValue,
  onChange,
  onBlur,
  timeFormat = "hh:mm a",
  timeIntervals = 1,
  timeZone,
  showTimezoneSelect = true,
  includeContinent = false,
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

  const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [selectedTimeZone, setSelectedTimeZone] = useState<
    string | string[] | undefined
  >(
    timeZone ||
      (!showTimezoneSelect
        ? systemTimezone
        : getTimezone(value ?? defaultValue ?? "")),
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    setInputValue(input);
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const input = e.target.value;
    // Get the period from the input if exists to avoid use the default period
    const inputPeriod = input.split(" ")[1] as TimePeriod;

    if (!isValidTimeInput(input)) {
      if (input === "") {
        setInputValue(input);
        onChange?.(createChangeEvent(""));
        onBlur?.(createBlurEvent(""));
        return;
      }
      // Create an empty but valid time value that matches the format expected by the value prop
      const inValid = formatInputsToValueFormat("", "", "±00:00");
      setInputValue(input);
      onChange?.(createChangeEvent(inValid));
      onBlur?.(createBlurEvent(input));
      return;
    }
    const validDisplay = formatInputToDisplayValid(
      input,
      is12HourFormat,
      timeIntervals,
      inputPeriod,
    );
    // Check if the validDisplay is empty and if it is, set the inputValue to an empty string
    if (!validDisplay) {
      setInputValue("");
      onChange?.(createChangeEvent(""));
      onBlur?.(createBlurEvent(""));
      return;
    }

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
    onBlur?.(createBlurEvent(validDisplay));
  };

  // Generate hours according to the format
  const hours = is12HourFormat
    ? Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")) // 1-12
    : Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")); // 0-23

  const minutes = useMemo(() => {
    if (timeIntervals > 1) {
      const arr: string[] = [];
      for (let i = 0; i < 60; i += timeIntervals) {
        arr.push(String(i).padStart(2, "0"));
      }
      return arr;
    }
    return Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
  }, [timeIntervals]);

  const handleSave = () => {
    setIsOpen(false);
    const offsetUTC = timeZone
      ? getOffset(timeZone)
      : getOffset(selectedTimeZone as string);

    // Value to save in the onSubmit
    const datetime = formatInputsToValueFormat(
      selectedHour,
      selectedMinute,
      offsetUTC,
    );
    // If there are no hours and minutes selected, do nothing
    if (!selectedHour && !selectedMinute) {
      return;
    }
    // Set default values
    let hourToUse = selectedHour;
    if (!selectedHour && selectedMinute) {
      hourToUse = is12HourFormat ? "12" : "00";
    }

    let periodToUse = selectedPeriod;
    if (is12HourFormat && !selectedPeriod) {
      const hourNum = parseInt(selectedHour);
      periodToUse = hourNum >= 8 && hourNum <= 11 ? "AM" : "PM";
      setSelectedPeriod(periodToUse);
    }

    // Condition that if the format is 12 hours and there are no minutes selected and there are no minutes selected adds a 00
    let minuteToUse = selectedMinute;
    if (!selectedMinute) {
      minuteToUse = "00";
    }

    // Value to display in the input get values from the popover interface
    const valueToDisplay = is12HourFormat
      ? `${hourToUse}:${minuteToUse} ${periodToUse}`
      : `${hourToUse}:${minuteToUse}`;

    setInputValue(valueToDisplay);
    onChange?.(createChangeEvent(datetime));
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const options = useMemo(() => {
    return getOptions(includeContinent);
  }, [includeContinent]);

  // if timeZone, then the options of select will be that timeZone and the offset
  const isDisableSelect = timeZone || !showTimezoneSelect ? true : false;
  const timeZonesOptions =
    timeZone || !showTimezoneSelect
      ? [
          options.find((opt) => opt.value === (timeZone || systemTimezone)) || {
            label: `(${getOffsetToDisplay(timeZone || systemTimezone)}) ${
              includeContinent
                ? (timeZone || systemTimezone).replace(/_/g, " ")
                : (timeZone || systemTimezone)
                    .split("/")
                    .pop()
                    ?.replace(/_/g, " ")
            }`,
            value: timeZone || systemTimezone,
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
