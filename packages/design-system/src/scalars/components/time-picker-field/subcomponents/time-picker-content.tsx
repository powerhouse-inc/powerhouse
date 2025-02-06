import * as React from "react";

import { Button } from "../../fragments/button";
import { TimePeriod } from "../type";
import { SelectBaseProps } from "../../enum-field/types";
import TimePeriodSelector from "./time-period-selector";
import TimeSelector from "./time-selector";
import { SelectFieldProps, SelectFieldRaw } from "../../fragments/select-field";
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
}) => {
  return (
    <div className="w-full mx-auto relative">
      <SelectFieldRaw
        name=""
        options={timeZonesOptions}
        searchable={true}
        placeholder="Select a timezone"
        className="w-full"
        selectionIcon="checkmark"
        {...selectProps}
      />

      <TimePeriodSelector
        selectedPeriod={selectedPeriod}
        setSelectedPeriod={setSelectedPeriod}
      />
      <div
        className="flex justify-center mt-[14px] h-[148px] mx-auto overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)",
        }}
      >
        <TimeSelector
          options={hours}
          selectedValue={selectedHour}
          onSelect={setSelectedHour}
        />
        <div className="flex items-center text-sm font-normal text-gray-900 leading-[20px] px-4">
          :
        </div>
        <TimeSelector
          options={minutes}
          selectedValue={selectedMinute}
          onSelect={setSelectedMinute}
        />
      </div>
      <div className="flex items-center justify-between pt-[27px]">
        <Button
          variant="ghost"
          onClick={onCancel}
          className="text-center text-[12px] font-inter font-medium leading-[18px] text-gray-500"
        >
          CANCEL
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            onSave?.(`${selectedHour}:${selectedMinute} ${selectedPeriod}`)
          }
          className="text-center text-[12px] font-inter font-medium leading-[18px] text-gray-500"
        >
          SAVE
        </Button>
      </div>
    </div>
  );
};

export default TimePickerContent;
