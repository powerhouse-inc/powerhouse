import { cn } from "@/scalars/lib/utils";
import { TimePeriod } from "../type";
import { Button } from "../../fragments/button";

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
          "h-[20px] w-[16px] text-[12px] leading-[28px] transition-colors",
          selectedPeriod === period ? "text-gray-900" : "text-gray-300",
        )}
      >
        {period}
      </Button>
    ))}
  </div>
);

export default TimePeriodSelector;
