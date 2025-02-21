import * as React from "react";
import { cn } from "@/scalars/lib/utils";
import { Button } from "../../fragments/button";

interface TimeSelectorProps {
  options: string[];
  selectedValue: string;
  onSelect: (value: string) => void;
}

const TimeSelector: React.FC<TimeSelectorProps> = ({
  options,
  selectedValue,
  onSelect,
}) => (
  <div className="relative w-[43px] overflow-hidden">
    <div className="absolute inset-0 flex flex-col items-center overflow-y-auto scrollbar-hide gap-1 no-scrollbar">
      <div className="h-[60px]" />
      {options.map((value) => (
        <Button
          variant="ghost"
          key={value}
          onClick={() => onSelect(value)}
          className={cn(
            "text-[12px] leading-[20px] flex cursor-pointer items-center justify-center",
            selectedValue === value
              ? "rounded-[6px] bg-white border border-gray-300 text-gray-900 font-normal px-3 py-2 "
              : "text-gray-900 w-[16px] h-[20px] font-normal",
          )}
        >
          {value}
        </Button>
      ))}
      <div className="mb-1" />
    </div>
  </div>
);

export default TimeSelector;
