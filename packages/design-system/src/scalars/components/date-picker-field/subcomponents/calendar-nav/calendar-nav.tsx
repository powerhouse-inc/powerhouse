import type React from "react";
import { useCallback, useMemo } from "react";
import { cn } from "@/scalars/lib/utils";
import { differenceInCalendarDays } from "date-fns";
import { useDayPicker } from "react-day-picker";
import { Icon } from "#powerhouse";
import { Button } from "../../../fragments/button/button";
import { type DatePickerView } from "../../types";

interface NavProps {
  className?: string;
  navView: DatePickerView;
  displayYears: { from: number; to: number };
  setDisplayYears: (years: { from: number; to: number }) => void;
  onPrevClick?: (date: Date) => void;
  onNextClick?: (date: Date) => void;
  startMonth?: Date;
  endMonth?: Date;
  buttonPreviousClassName?: string;
  buttonNextClassName?: string;
}

const NavCalendar: React.FC<NavProps> = ({
  className,
  navView,
  displayYears,
  setDisplayYears,
  onPrevClick,
  onNextClick,
  startMonth,
  endMonth,
  buttonPreviousClassName,
  buttonNextClassName,
}) => {
  const { nextMonth, previousMonth, goToMonth } = useDayPicker();

  // Function to check if the "Previous" button should be disabled
  const isPreviousDisabled = useMemo(() => {
    if (navView === "years") {
      const previousYearDate = new Date(displayYears.from - 1, 0, 1);
      return (
        (startMonth &&
          differenceInCalendarDays(previousYearDate, startMonth) < 0) ||
        (endMonth && differenceInCalendarDays(previousYearDate, endMonth) > 0)
      );
    }
    return !previousMonth;
  }, [navView, displayYears, startMonth, endMonth, previousMonth]);

  // Function to check if the "Next" button should be disabled
  const isNextDisabled = useMemo(() => {
    if (navView === "years") {
      const nextYearDate = new Date(displayYears.to + 1, 0, 1);
      return (
        (startMonth &&
          differenceInCalendarDays(nextYearDate, startMonth) < 0) ||
        (endMonth && differenceInCalendarDays(nextYearDate, endMonth) > 0)
      );
    }
    return !nextMonth;
  }, [navView, displayYears, startMonth, endMonth, nextMonth]);

  const handlePreviousClick = useCallback(() => {
    if (!previousMonth) return;
    if (navView === "years") {
      const newDisplayYears = {
        from: displayYears.from - (displayYears.to - displayYears.from + 1),
        to: displayYears.to - (displayYears.to - displayYears.from + 1),
      };
      setDisplayYears(newDisplayYears);
      onPrevClick?.(
        new Date(
          displayYears.from - (displayYears.to - displayYears.from),
          0,
          1,
        ),
      );
      return;
    }
    goToMonth(previousMonth);
    onPrevClick?.(previousMonth);
  }, [
    previousMonth,
    goToMonth,
    navView,
    displayYears,
    setDisplayYears,
    onPrevClick,
  ]);

  const handleNextClick = useCallback(() => {
    if (!nextMonth) return;
    if (navView === "years") {
      const newDisplayYears = {
        from: displayYears.from + (displayYears.to - displayYears.from + 1),
        to: displayYears.to + (displayYears.to - displayYears.from + 1),
      };
      setDisplayYears(newDisplayYears);
      onNextClick?.(
        new Date(
          displayYears.from + (displayYears.to - displayYears.from),
          0,
          1,
        ),
      );
      return;
    }
    goToMonth(nextMonth);
    onNextClick?.(nextMonth);
  }, [
    nextMonth,
    goToMonth,
    navView,
    displayYears,
    setDisplayYears,
    onNextClick,
  ]);

  return (
    <nav className={cn("flex items-center", className)}>
      <Button
        variant="outline"
        className={cn(
          "absolute left-0 size-7 bg-transparent p-0 opacity-80 hover:opacity-100",
          buttonPreviousClassName,
        )}
        type="button"
        tabIndex={isPreviousDisabled ? undefined : -1}
        disabled={isPreviousDisabled}
        aria-label={
          navView === "years"
            ? `Go to the previous ${displayYears.to - displayYears.from + 1} years`
            : `Previous month`
        }
        onClick={handlePreviousClick}
      >
        <Icon className="size-4" name="CaretLeft" />
      </Button>

      <Button
        variant="outline"
        className={cn(
          "absolute right-0 size-7 bg-transparent p-0 opacity-80 hover:opacity-100",
          buttonNextClassName,
        )}
        type="button"
        tabIndex={isNextDisabled ? undefined : -1}
        disabled={isNextDisabled}
        aria-label={
          navView === "years"
            ? `Go to the next ${displayYears.to - displayYears.from + 1} years`
            : `Next month`
        }
        onClick={handleNextClick}
      >
        <Icon className="size-4" name="CaretRight" />
      </Button>
    </nav>
  );
};

export default NavCalendar;
