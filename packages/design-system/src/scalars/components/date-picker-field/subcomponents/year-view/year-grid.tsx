import { format } from "date-fns";
import YearButton from "./year-button";

interface YearRange {
  from: number;
  to: number;
}
interface YearGridProps {
  displayYears: YearRange;
  startMonth?: Date;
  endMonth?: Date;
  actualMonth: string;
  months: { date: Date }[];
  currentYear: number;
  onYearSelect: (year: number) => void;
}

export const YearGrid = ({
  displayYears,
  startMonth,
  endMonth,
  actualMonth,
  months,
  currentYear,
  onYearSelect,
}: YearGridProps) => {
  const years = Array.from(
    { length: displayYears.to - displayYears.from + 1 },
    (_, i) => displayYears.from + i,
  );

  return (
    <div className="grid grid-cols-3 gap-x-[14px] gap-y-[15px]">
      {years.map((year) => (
        <YearButton
          key={year}
          year={year}
          actualYear={format(months[0].date, "yyyy")}
          currentYear={currentYear}
          startMonth={startMonth}
          endMonth={endMonth}
          actualMonth={actualMonth}
          months={months}
          onSelect={onYearSelect}
        />
      ))}
    </div>
  );
};
