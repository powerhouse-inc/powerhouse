import * as React from "react";

import { Button } from "../../fragments/button";
import { cn } from "@/scalars/lib/utils";
import { SelectField } from "../../fragments/select-field";
import { TimePeriod } from "../type";
import { SelectBaseProps } from "../../enum-field/types";
interface TimePickerContentProps {
  onSave?: (time: string) => void;
  onCancel?: () => void;
  selectedHour: string;
  selectedMinute: string;
  selectedPeriod: TimePeriod;
  setSelectedHour: (hour: string) => void;
  setSelectedMinute: (minute: string) => void;
  setSelectedPeriod: (period: TimePeriod) => void;
  hours: string[];
  minutes: string[];
  timeZonesOptions: SelectBaseProps["options"];
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
}) => {
  return (
    <div className="w-full mx-auto relative">
      <SelectField
        name="timeZone"
        options={timeZonesOptions}
        searchable={true}
        placeholder="Select a timezone"
        className="w-full"
        selectionIcon="checkmark"
      />

      <div className="flex flex-col  absolute top-[48px] right-1 z-10">
        {["AM", "PM"].map((period) => (
          <button
            key={period}
            onClick={() => setSelectedPeriod(period as "AM" | "PM")}
            className={cn(
              "h-[20px] w-[16px] text-[12px] leading-[28px]",
              "transition-colors",
              selectedPeriod === period ? "text-gray-900" : "text-gray-300"
            )}
          >
            {period}
          </button>
        ))}
      </div>
      <div
        className="flex justify-center  mt-[14px] h-[148px] mx-auto overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)",
        }}
      >
        <div className="relative w-[43px] ">
          <div
            className="absolute inset-0 flex flex-col items-center overflow-y-auto scrollbar-hide gap-1"
            style={{
              msOverflowStyle: "none",
              scrollbarWidth: "none",
            }}
          >
            <div className="h-[60px]  relative" />
            {hours.map((hour) => (
              <div
                key={hour}
                onClick={() => setSelectedHour(hour)}
                className={cn(
                  "px-3 py-2 text-[12px]",
                  "flex cursor-pointer items-center justify-center",
                  selectedHour === hour
                    ? "rounded-[6px] bg-white border border-gray-300"
                    : "text-gray-900 w-[16px] h-[20px]"
                )}
              >
                {hour}
              </div>
            ))}
            <div className="mb-1" />
          </div>
        </div>

        <div className="flex items-center text-sm font-normal text-gray-900 leading-[20px] px-4">
          :
        </div>

        <div className="relative w-[43px] overflow-hidden">
          <div
            className="absolute inset-0 flex flex-col items-center overflow-y-auto scrollbar-hide gap-1"
            style={{
              msOverflowStyle: "none",
              scrollbarWidth: "none",
            }}
          >
            <div className="h-[60px]" />
            {minutes.map((minute) => (
              <div
                key={minute}
                onClick={() => setSelectedMinute(minute)}
                className={cn(
                  "px-3 py-2 text-[12px]",
                  "flex cursor-pointer items-center justify-center",
                  selectedMinute === minute
                    ? "rounded-[6px] bg-white border border-gray-300 text-gray-900"
                    : "text-gray-900 w-[16px] h-[20px]"
                )}
              >
                {minute}
              </div>
            ))}
            <div className="mb-1" />
          </div>
        </div>
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
