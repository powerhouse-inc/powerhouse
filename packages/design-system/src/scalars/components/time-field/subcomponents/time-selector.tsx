import * as React from "react";
import { useRef } from "react";
import { cn } from "../../../lib/utils.js";
import { Button } from "../../fragments/button/index.js";
import { type TimeSelectorProps } from "../type.js";
import { useTimeSelector } from "./use-time-selector.js";

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
        className="absolute inset-0 flex flex-col items-center gap-1 overflow-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar-thumb]:!hidden [&::-webkit-scrollbar-track]:!hidden [&::-webkit-scrollbar]:!hidden"
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
                "flex h-[37px] cursor-pointer items-center justify-center text-[12px] leading-[20px]",
                selectedValue === option
                  ? "rounded-[6px] border border-gray-300 bg-white px-3 py-2 font-normal text-gray-900"
                  : "h-[20px] w-[16px] font-normal text-gray-900",
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
