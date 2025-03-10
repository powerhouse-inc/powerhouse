import { cn } from "#scalars";
import type * as React from "react";
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
    <div className="scrollbar-hide no-scrollbar absolute inset-0 flex flex-col items-center gap-1 overflow-y-auto">
      <div className="h-[60px]" />
      {options.map((value) => (
        <Button
          variant="ghost"
          key={value}
          onClick={() => onSelect(value)}
          className={cn(
            "flex cursor-pointer items-center justify-center text-[12px] leading-[20px]",
            selectedValue === value
              ? "rounded-[6px] border border-gray-300 bg-white px-3 py-2 font-normal text-gray-900"
              : "h-[20px] w-[16px] font-normal text-gray-900",
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
