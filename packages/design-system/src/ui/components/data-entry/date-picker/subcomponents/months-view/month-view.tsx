import { cn } from "#scalars";
import { Button } from "../../../../../../scalars/components/fragments/button/index.js";
import { MONTHS } from "../utils.js";

interface MonthGridProps {
  actualMonth: string;
  actualYear: string;
  onMonthSelect: (year: number, monthIndex: number) => void;
}

export const MonthGrid = ({
  actualMonth,
  actualYear,
  onMonthSelect,
}: MonthGridProps) => {
  return (
    <div className="grid grid-cols-3 gap-x-[14px] gap-y-[15px]">
      {MONTHS.flat().map((month) => (
        <Button
          key={month}
          variant="ghost"
          className={cn(
            "w-full px-[2px] py-[5px] text-[12px] leading-[18px] text-gray-900",
            month === actualMonth && "bg-gray-900 hover:bg-gray-900",
            "hover:bg-gray-100",
            month === actualMonth && "bg-gray-900 text-white hover:bg-gray-900",
          )}
          onClick={() =>
            onMonthSelect(parseInt(actualYear), MONTHS.indexOf(month))
          }
        >
          {month}
        </Button>
      ))}
    </div>
  );
};
