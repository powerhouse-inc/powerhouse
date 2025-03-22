import type * as React from "react";

import {
  SelectFieldRaw,
  type SelectBaseProps,
  type SelectFieldProps,
} from "#scalars";
import { Button } from "../../../../../scalars/components/fragments/button/button.js";
import { type TimePeriod } from "../type.js";
import TimePeriodSelector from "./time-period-selector.js";
import TimeSelector from "./time-selector.js";
interface TimePickerContentProps {
  onSave?: (time: string) => void;
  onCancel?: () => void;
  selectedHour: string;
  selectedMinute: string;
  selectedPeriod?: TimePeriod;
  setSelectedHour: (hour: string) => void;
  setSelectedMinute: (minute: string) => void;
  setSelectedPeriod: (period?: TimePeriod) => void;
  hours: string[];
  minutes: string[];
  timeZonesOptions: SelectBaseProps["options"];
  selectProps?: Omit<SelectFieldProps, "name" | "options" | "selectionIcon">;
  is12HourFormat: boolean;
  selectedTimeZone?: string;
  setSelectedTimeZone?: (timeZone: string | string[]) => void;
  timeZone?: string;
  isDisableSelect?: boolean;
}

const TimePickerContent: React.FC<TimePickerContentProps> = ({
  onSave,
  onCancel,
  selectedHour,
  selectedMinute,
  selectedPeriod,
  setSelectedHour,
  setSelectedMinute,
  setSelectedPeriod,
  hours,
  minutes,
  timeZonesOptions,
  selectProps,
  is12HourFormat,
  isDisableSelect,
  selectedTimeZone,
  setSelectedTimeZone,
  timeZone,
}) => {
  return (
    <div className="relative mx-auto w-full">
      <SelectFieldRaw
        name=""
        options={timeZonesOptions}
        disabled={isDisableSelect}
        searchable={true}
        placeholder="Select a timezone"
        className="w-full"
        selectionIcon="checkmark"
        value={timeZone || selectedTimeZone}
        onChange={setSelectedTimeZone}
        {...selectProps}
      />

      {is12HourFormat && (
        <TimePeriodSelector
          selectedPeriod={selectedPeriod}
          setSelectedPeriod={setSelectedPeriod}
        />
      )}
      <div
        className="mx-auto mt-[15px] flex h-[148px] justify-center overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)",
        }}
      >
        <TimeSelector
          options={hours}
          selectedValue={selectedHour}
          onSelect={setSelectedHour}
          isCyclic={true}
        />
        <div className="flex items-center px-4 text-sm font-normal leading-[20px] text-gray-900">
          :
        </div>
        <TimeSelector
          options={minutes}
          selectedValue={selectedMinute}
          onSelect={setSelectedMinute}
          isCyclic={true}
        />
      </div>
      <div className="flex items-center justify-between pt-[25px]">
        <Button
          variant="ghost"
          onClick={onCancel}
          className="font-inter text-center text-[12px] font-medium leading-[18px] text-gray-500"
        >
          CANCEL
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            onSave?.(`${selectedHour}:${selectedMinute} ${selectedPeriod}`)
          }
          className="font-inter text-center text-[12px] font-medium leading-[18px] text-gray-500"
        >
          SAVE
        </Button>
      </div>
    </div>
  );
};

export default TimePickerContent;
