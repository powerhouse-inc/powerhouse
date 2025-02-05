import { format, getHours, getMinutes, parse } from "date-fns";
import React, { useMemo } from "react";
import { TimeFieldValue } from "./type";

export const useTimePickerField = (
  value?: TimeFieldValue,
  defaultValue?: TimeFieldValue,
) => {
  // Get the current hour and minutes
  const now = new Date();
  const currentHour = getHours(now);
  const currentMinute = getMinutes(now);
  // Input value format time
  const [inputValue, setInputValue] = React.useState(
    value ?? defaultValue ?? "",
  );
  const [isOpen, setIsOpen] = React.useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  // Convert the hour to 12-hour format and determine AM/PM
  const formattedHour = currentHour % 12 || 12;
  const period = currentHour >= 12 ? "PM" : "AM";

  const [selectedHour, setSelectedHour] = React.useState(
    String(formattedHour).padStart(2, "0"),
  );
  const [selectedMinute, setSelectedMinute] = React.useState(
    String(currentMinute).padStart(2, "0"),
  );
  const [selectedPeriod, setSelectedPeriod] = React.useState<"AM" | "PM">(
    period,
  );
  // Generate hours from 1 to 12
  const hours = Array.from({ length: 12 }, (_, i) =>
    String(i + 1).padStart(2, "0"),
  );

  // Generate minutes from 0 to 59
  const minutes = Array.from({ length: 60 }, (_, i) =>
    String(i).padStart(2, "0"),
  );

  const handleSave = () => {
    // Format the time correctly with date-fns
    const timeString = `${selectedHour}:${selectedMinute} ${selectedPeriod}`;
    const parsedTime = parse(timeString, "hh:mm a", new Date());

    // Convert it to a correctly formatted string
    const formattedTime = format(parsedTime, "hh:mm a");

    setInputValue(formattedTime);
    setIsOpen(false);
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
    // WIP: Return default offset of the time zone
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
  };
};
