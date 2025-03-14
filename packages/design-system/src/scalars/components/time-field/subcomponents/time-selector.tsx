import * as React from "react";
import { useRef } from "react";
import { Button } from "../../fragments/button";
import { useTimeSelector } from "./use-time-selector";
import { cn } from "@/scalars/lib/utils";
import { TimeSelectorProps } from "../type";

const TimeSelector: React.FC<TimeSelectorProps> = ({
  options,
  selectedValue,
  onSelect,
  isCyclic = true,
}) => {
  const selectedRef = React.useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { displayOptions, handleExplicitSelection } = useTimeSelector({
    options,
    selectedValue,
    onSelect,
    isCyclic,
    containerRef,
    selectedRef,
  });

  return (
    <div className="relative w-[43px] overflow-hidden">
      <div
        ref={containerRef}
        className="absolute inset-0 flex flex-col items-center overflow-y-auto scrollbar-hide gap-1 no-scrollbar"
      >
        {isCyclic && <div className="h-[60px]" />}
        {displayOptions.map((option, index) => {
          // Determine if this is the middle set of options (for proper reference)
          const isMiddleSet =
            index >= options.length && index < options.length * 2;
          const shouldUseRef = option === selectedValue && isMiddleSet;

          return (
            <Button
              ref={shouldUseRef ? selectedRef : null}
              variant="ghost"
              key={`${option}-${index}`}
              onClick={() => handleExplicitSelection(option)}
              className={cn(
                "h-[37px] text-[12px] leading-[20px] flex cursor-pointer items-center justify-center",
                selectedValue === option
                  ? "rounded-[6px] bg-white border border-gray-300 text-gray-900 font-normal px-3 py-2"
                  : "text-gray-900 w-[16px] h-[20px] font-normal",
              )}
            >
              {option}
            </Button>
          );
        })}
      </div>
      {isCyclic && <div className="h-[60px]" />}
    </div>
  );
};

export default TimeSelector;
