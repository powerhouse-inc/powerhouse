import { cn } from "#scalars";
import { differenceInCalendarDays } from "date-fns";
import { Button } from "../../../../../../scalars/components/fragments/button/index.js";

interface YearButtonProps {
  year: number;
  actualYear: string;
  currentYear: number;
  startMonth?: Date;
  endMonth?: Date;
  actualMonth: string;
  months: { date: Date }[];
  onSelect: (year: number) => void;
  disabled?: boolean;
}

const YearButton = ({
  year,
  actualYear,
  currentYear,
  startMonth,
  endMonth,
  actualMonth,
  months,
  onSelect,
  disabled,
}: YearButtonProps) => {
  const isBefore =
    differenceInCalendarDays(new Date(year, 11, 31), startMonth!) < 0;

  const isAfter = differenceInCalendarDays(new Date(year, 0, 0), endMonth!) > 0;

  return (
    <Button
      className={cn(
        "h-[28px] w-[68px] rounded-[4px] text-[12px] leading-[18px] text-gray-900",
        year === currentYear &&
          "text-accent-foreground bg-gray-100 font-medium",
        "hover:bg-gray-100",
        year === months[0].date.getFullYear() &&
          "bg-gray-900 text-white hover:bg-gray-900",
      )}
      variant="ghost"
      onClick={() => onSelect(year)}
      disabled={disabled || isBefore || isAfter}
    >
      {year}
    </Button>
  );
};

export default YearButton;
