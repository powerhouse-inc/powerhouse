import { format } from "date-fns";
import React, { useState } from "react";
import { DateFieldValue } from "../../../ui/components/data-entry/date-picker/types.js";
import { useDatePickerField } from "../../../ui/components/data-entry/date-picker/use-date-picker.js";
import { getDateFromValue, getTimeFromValue } from "../../../ui/components/data-entry/date-picker/utils.js";
import type {
  TimeFieldValue,
  TimePeriod,
} from "../../../ui/components/data-entry/time-picker/type.js";
import {
  convertTimeFrom24To12Hours,
  useTimePickerField,
} from "../../../ui/components/data-entry/time-picker/use-time-picker-field.js";
import {
  cleanTime,
  convert12hTo24h,
  createChangeEvent,
  formatInputsToValueFormat,
  formatInputToDisplayValid,
  getHoursAndMinutes,
  getInputValue,
  isValidTimeInput,
} from "../../../ui/components/data-entry/time-picker/utils.js";
import {
  createBlurEvent,
  getDateFormat,
  getOffset,
  parseInputString,
  splitDateTimeStringFromInput,
} from "./utils.js";

interface DateTimeFieldProps {
  value?: DateFieldValue;
  defaultValue?: DateFieldValue;

  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;

  // Date Picker Field
  autoClose?: boolean;
  disableFutureDates?: boolean;
  disablePastDates?: boolean;
  dateFormat?: string;
  onBlurDate?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onChangeDate?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  minDate?: string;
  maxDate?: string;
  weekStart?: string;

  // Time Picker Field
  onChangeTime?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlurTime?: (e: React.FocusEvent<HTMLInputElement>) => void;
  timeFormat?: string;
  timeIntervals?: number;
  timeZone?: string;
  showTimezoneSelect?: boolean;
  includeContinent?: boolean;
}

export const formatToISODateTimeWithOffset = (
  datePart: string,
  timePart: string,
  timeZone?: string,
): string => {
  // WIP: think if we need validate timePart before format it with 00 at the end
  const formattedTime = timePart ? `${timePart}:00` : "00:00:00";
  // const formattedTime = timePart ? `${timePart}:00` : "00:00:00";
  const formattedDateTime = `${datePart}T${formattedTime}${getOffset(timeZone)}`;
  // WIP: check the replace sentence
  const formattedTimeWithMiliseconds =
    formattedDateTime.replace(/(:\d{2})([+-].*|Z)/, "$1.000$2") || "";
  return formattedTimeWithMiliseconds;
};

const todayInIsoFormat = () => {
  return format(new Date(), "yyyy-MM-dd'T'HH:mm:ssXXX");
};

const todayTimeInput = () => {
  return format(new Date(), "HH:mm:ss");
};
const todayDateInput = () => {
  return format(new Date(), "yyyy-MM-dd");
};

const parseDateTimeValueToInput = (
  value: DateFieldValue,
  dateFormat = "yyyy-MM-dd",
) => {
  const datePart = getDateFromValue(value);
  const dateFormatted = parseInputString(datePart, dateFormat);

  const timePart = getTimeFromValue(value);

  const timeFormatted = getInputValue(timePart);
  let date = dateFormatted;
  let time = timeFormatted;

  if (!dateFormatted && !timeFormatted) {
    return "";
  }

  const dateDefault = todayDateInput();
  const timeDefault = todayTimeInput();

  if (!dateFormatted) {
    // set date to today in string format
    date = dateDefault;
  }

  if (!timeFormatted) {
    // set time to current time in string format
    time = timeDefault;
  }
  return `${date} ${time}`;
};

const putTimeInValue = (value: DateFieldValue, time: TimeFieldValue) => {
  let datePart = getDateFromValue(value);
  // put today if datePart is empty
  if (!datePart) {
    const today = todayInIsoFormat();
    datePart = getDateFromValue(today);
  }
  return `${datePart}T${time}`;
};

const putDateInValue = (value: DateFieldValue, date: DateFieldValue) => {
  let timePart = getTimeFromValue(value);

  if (!timePart) {
    const today = todayInIsoFormat();
    timePart = getTimeFromValue(today);
  }

  const datePart = getDateFromValue(date);
  const newValue = `${datePart}T${timePart}`;
  const formattedTime =
    newValue.replace(/(:\d{2})([+-].*|Z)/, "$1.000$2") || "";
  return formattedTime;
};

export const useDateTime = ({
  value,
  defaultValue,
  onChange,
  onBlur,

  // Date Picker Field
  autoClose,
  disableFutureDates,
  disablePastDates,
  dateFormat,
  weekStart,
  minDate,
  maxDate,

  // Time Picker Field
  timeFormat,
  timeIntervals,
  timeZone,
  showTimezoneSelect = true,
  includeContinent,
}: DateTimeFieldProps) => {
  const internalFormat = getDateFormat(dateFormat ?? "");
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeTab, setActiveTab] = useState<"date" | "time">("date");

  const [dateTimeToDisplay, setDateTimeToDisplay] = useState(
    parseDateTimeValueToInput(
      value ?? defaultValue ?? "",
      internalFormat ?? "",
    ),
  );
  // formatInputsToValueFormat
  const onChangeDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    // TODO: parse date and time to correct format
    const date = e.target.value;
    const newValue = putDateInValue(value ?? defaultValue ?? "", date);
    const newVInput = parseDateTimeValueToInput(newValue, internalFormat);

    const splitTime = newVInput.split(" ")[1];
    const splitDate = newVInput.split(" ")[0];

    const transformedTime = formatInputToDisplayValid(
      splitTime,
      is12HourFormat,
      timeIntervals,
    );

    const { hours, minutes, period } = getHoursAndMinutes(transformedTime);

    setSelectedHour(cleanTime(hours));
    setSelectedMinute(cleanTime(minutes));
    if (is12HourFormat) {
      setSelectedPeriod(period as TimePeriod);
    }
    const inputDisplay = `${splitDate.toLocaleUpperCase()} ${transformedTime}`;

    setDateTimeToDisplay(inputDisplay);
    onChange?.(createChangeEvent(newValue));
  };

  const {
    date,
    handleDateSelect,
    handleInputChange,
    handleBlur,
    disabledDates,
    weekStartDay,
  } = useDatePickerField({
    value,
    defaultValue,
    onChange: onChangeDate,
    // Specific for DatePickerField
    dateFormat,
    disablePastDates,
    disableFutureDates,
    autoClose,
    weekStart,
    minDate,
    maxDate,
  });

  const timeInput = getTimeFromValue(value ?? defaultValue ?? "");

  const onChangeTime = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsOpen(false);
    const time = e.target.value;

    const newValue = putTimeInValue(value ?? defaultValue ?? "", time);
    const newVInput = parseDateTimeValueToInput(newValue, internalFormat);
    setDateTimeToDisplay(newVInput);
    onChange?.(createChangeEvent(newValue));
  };

  const handleOnBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    if (!inputValue) {
      setDateTimeToDisplay(inputValue);
      onChange?.(createChangeEvent(""));
      onBlur?.(createBlurEvent(""));
      return;
    }
    // Get the time and tran
    const timeValue = inputValue.split(" ")[1];
    // Get period from input if exists
    const periodInput = inputValue.split(" ")[2] as TimePeriod;

    if (!isValidTimeInput(timeValue)) {
      if (inputValue === "") {
        setDateTimeToDisplay(inputValue);
        onChange?.(createChangeEvent(""));
        onBlur?.(createBlurEvent(""));
        return;
      }

      // Create an empty but valid time value that matches the format expected by the value prop
      const inValid = formatInputsToValueFormat("", "", "+00:00");
      setDateTimeToDisplay(inputValue);
      onChange?.(createChangeEvent(inValid));
      onBlur?.(createBlurEvent(inputValue));
      return;
    }

    const datetimeFormatted = formatInputToDisplayValid(
      timeValue,
      is12HourFormat,
      timeIntervals,
      periodInput,
    );
    const validValue = convert12hTo24h(datetimeFormatted);
    const offsetUTC = getOffset(timeZone);
    const { minutes, hours, period } = getHoursAndMinutes(validValue);

    const clearMinutes = cleanTime(minutes);
    const clearHours = convertTimeFrom24To12Hours(cleanTime(hours));
    setSelectedHour(clearHours);
    setSelectedMinute(clearMinutes);
    if (is12HourFormat) {
      setSelectedPeriod(period as TimePeriod);
    }
    const timeFormat = formatInputsToValueFormat(hours, minutes, offsetUTC);
    const newValue = putTimeInValue(value ?? defaultValue ?? "", timeFormat);
    const newVInput = newValue.split("T")[0];
    const valueFormatted = `${newVInput} ${datetimeFormatted}`;
    setDateTimeToDisplay(valueFormatted);
    onChange?.(createChangeEvent(newValue));
    onBlur?.(createBlurEvent(newValue));
  };

  const {
    selectedHour,
    selectedMinute,
    selectedPeriod,
    setSelectedHour,
    setSelectedMinute,
    setSelectedPeriod,
    hours,
    minutes,
    timeZonesOptions,
    selectedTimeZone,
    is12HourFormat,
    setSelectedTimeZone,
    isDisableSelect,
  } = useTimePickerField({
    value: timeInput,
    defaultValue: timeInput,
    onChange: onChangeTime,
    onBlur: handleOnBlur,
    timeFormat,
    timeIntervals,
    timeZone,
    showTimezoneSelect,
    includeContinent,
  });

  const handleInputChangeField = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setDateTimeToDisplay(inputValue);
    const { date, time } = splitDateTimeStringFromInput(inputValue);
    const offset = getOffset(timeZone);
    let formattedDateTime = formatToISODateTimeWithOffset(date, time, offset);
    if (!time && !date) {
      formattedDateTime = inputValue;
    }
    const [hour, minute] = time.split(":");
    setSelectedHour(hour);
    setSelectedMinute(minute);
    onChange?.(createChangeEvent(formattedDateTime));
  };

  const onChangeTabs = (value: string) => {
    setActiveTab(value as "date" | "time");
  };

  const isCalendarView = activeTab === "date";

  // Close the calendar when a date is selected, move this to callback
  const handleDayClick = () => {
    if (autoClose) {
      setIsOpen(false);
    }
  };

  const onCancel = () => {
    setIsOpen(false);
  };
  // WIP: need to be refactored to work with the date
  const handleOnSave = () => {
    setIsOpen(false);
    const offsetUTC = timeZone
      ? getOffset(timeZone)
      : getOffset(selectedTimeZone as string);

    setSelectedHour(cleanTime(selectedHour));
    setSelectedMinute(cleanTime(selectedMinute));

    const newValueTime = formatInputsToValueFormat(
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
      setSelectedHour(hourToUse);
    }

    let periodToUse = selectedPeriod;
    if (is12HourFormat && !selectedPeriod) {
      const hourNum =
        selectedHour && selectedHour !== "" ? parseInt(selectedHour) : 0;
      periodToUse = hourNum >= 8 && hourNum <= 11 ? "AM" : "PM";
      setSelectedPeriod(periodToUse);
    }
    if (is12HourFormat) {
      setSelectedPeriod(periodToUse);
    }

    const timeToDisplay = is12HourFormat
      ? `${hourToUse}:${selectedMinute} ${periodToUse}`
      : `${hourToUse}:${selectedMinute}`;

    const newValue = putTimeInValue(value ?? defaultValue ?? "", newValueTime);
    const valueDate = parseDateTimeValueToInput(newValue, internalFormat).split(
      " ",
    )[0];
    // Convert to uppercase for the value and for the input display
    const upperValueDate = valueDate.toUpperCase();

    const valueWithFormat = putDateInValue(newValue, upperValueDate);
    const inputDisplay = `${upperValueDate} ${timeToDisplay}`;
    setDateTimeToDisplay(inputDisplay);
    onChange?.(createChangeEvent(valueWithFormat));
  };

  return {
    isOpen,
    setIsOpen,
    activeTab,
    onChangeTabs,
    isCalendarView,
    dateTimeToDisplay,
    handleInputChangeField,
    handleOnBlur,
    date,
    // DatePicker Field
    handleDateSelect,
    handleInputChange,
    handleBlur,
    disabledDates,
    weekStartDay,
    handleDayClick,
    // TimePicker Field
    selectedHour,
    selectedMinute,
    selectedPeriod,
    setSelectedHour,
    setSelectedMinute,
    setSelectedPeriod,
    hours,
    minutes,
    onCancel,
    timeZonesOptions,
    handleSave: handleOnSave,
    selectedTimeZone,
    setSelectedTimeZone,
    is12HourFormat,
    isDisableSelect,
  };
};
