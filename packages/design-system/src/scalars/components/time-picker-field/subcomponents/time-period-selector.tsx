import { cn } from "#scalars";
import { Button } from "../../fragments/button/index.js";
import { type TimePeriod } from "../type.js";

interface TimePeriodSelectorProps {
  selectedPeriod?: TimePeriod;
  setSelectedPeriod: (period: TimePeriod) => void;
}

const TimePeriodSelector: React.FC<TimePeriodSelectorProps> = ({
  selectedPeriod,
  setSelectedPeriod,
}) => (
  <div className="absolute right-1 top-[48px] z-10 flex flex-col">
    {["AM", "PM"].map((period) => (
      <Button
        variant="ghost"
        key={period}
        onClick={() => setSelectedPeriod(period as TimePeriod)}
        className={cn(
          "h-[20px] w-[16px] text-[12px] font-normal leading-[28px] transition-colors",
          selectedPeriod === period
            ? "font-normal text-gray-900"
            : "font-normal text-gray-300",
        )}
      >
        {period}
      </Button>
    ))}
  </div>
);

export default TimePeriodSelector;
