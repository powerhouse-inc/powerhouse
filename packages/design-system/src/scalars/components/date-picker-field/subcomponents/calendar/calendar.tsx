"use client";

import { cn } from "@/scalars/lib/utils";
import { differenceInCalendarDays, format } from "date-fns";
import * as React from "react";
import { DayPicker, useDayPicker, type DayPickerProps } from "react-day-picker";
import { buttonVariants } from "../../../fragments/button/button";
import { Button } from "../../../fragments/button/button";
import { Icon } from "@/powerhouse";
import { MONTHS } from "../utils";
import { DatePickerView } from "../../types";
import CaptionLabel from "../caption-label/caption-label";
import NavCalendar from "../calendar-nav/calendar-nav";
import CalendarDateHeader from "../calendar-date-header/calendar-date-header";

export type CalendarProps = DayPickerProps & {
  /**
   * In the year view, the number of years to display at once.
   * @default 12
   */
  yearRange?: number;

  /**
   * Wether to show the year switcher in the caption.
   * @default true
   */
  showYearSwitcher?: boolean;

  monthsClassName?: string;
  monthCaptionClassName?: string;
  weekdaysClassName?: string;
  weekdayClassName?: string;
  monthClassName?: string;
  captionClassName?: string;
  captionLabelClassName?: string;
  buttonNextClassName?: string;
  buttonPreviousClassName?: string;
  navClassName?: string;
  monthGridClassName?: string;
  weekClassName?: string;
  dayClassName?: string;
  dayButtonClassName?: string;
  rangeStartClassName?: string;
  rangeEndClassName?: string;
  selectedClassName?: string;
  todayClassName?: string;
  outsideClassName?: string;
  disabledClassName?: string;
  rangeMiddleClassName?: string;
  hiddenClassName?: string;
  dayPickerClassName?: string;
  disabledDates?: boolean;
};

/**
 * A custom calendar component built on top of react-day-picker.
 * @param props The props for the calendar.
 * @default yearRange 12
 * @returns
 */
const Calendar = ({
  className,
  showOutsideDays = true,
  showYearSwitcher = true,
  yearRange = 12,
  numberOfMonths,
  disabledDates = false,
  ...props
}: CalendarProps) => {
  const [navView, setNavView] = React.useState<DatePickerView>("days");
  const [displayYears, setDisplayYears] = React.useState<{
    from: number;
    to: number;
  }>(
    React.useMemo(() => {
      const currentYear = new Date().getFullYear();
      return {
        from: currentYear - Math.floor(yearRange / 2 - 1),
        to: currentYear + Math.ceil(yearRange / 2),
      };
    }, [yearRange]),
  );

  const { onNextClick, onPrevClick, startMonth, endMonth } = props;

  const columnsDisplayed = navView === "years" ? 1 : numberOfMonths;

  const _monthsClassName = cn("relative flex", props.monthsClassName);
  const _monthCaptionClassName = cn(
    "relative mx-10 flex h-7 items-center justify-center",
    props.monthCaptionClassName,
  );
  const _weekdaysClassName = cn("flex flex-row", props.weekdaysClassName);
  const _weekdayClassName = cn(
    "text-muted-foreground w-8 text-sm font-normal",
    props.weekdayClassName,
  );
  const _monthClassName = cn("w-full", props.monthClassName);
  const _captionClassName = cn(
    "relative flex items-center justify-center pt-1",
    "w-full",
    props.captionClassName,
  );
  const _captionLabelClassName = cn(
    "truncate text-sm font-medium",
    props.captionLabelClassName,
  );
  const buttonNavClassName = buttonVariants({
    variant: "outline",
    className:
      "absolute h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
  });
  const _buttonNextClassName = cn(
    buttonNavClassName,
    "right-0",
    props.buttonNextClassName,
  );
  const _buttonPreviousClassName = cn(
    buttonNavClassName,
    "left-0",
    props.buttonPreviousClassName,
  );
  const _navClassName = cn("flex items-start", props.navClassName);
  const _monthGridClassName = cn(
    "mt-[15px]",
    "w-auto",
    props.monthGridClassName,
  );
  const _weekClassName = cn(
    "mt-[5px] flex w-max items-start",
    props.weekClassName,
  );
  const _dayClassName = cn(
    "flex h-[34px] w-8 flex-1 items-center justify-center p-0 text-sm",
    props.dayClassName,
  );
  const _dayButtonClassName = cn(
    buttonVariants({ variant: "ghost" }),
    "size-8 rounded-md p-0 font-normal transition-none aria-selected:opacity-100",
    props.dayButtonClassName,
  );
  const buttonRangeClassName =
    "bg-accent [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground";
  const _rangeStartClassName = cn(
    buttonRangeClassName,
    "day-range-start rounded-s-md",
    props.rangeStartClassName,
  );
  const _rangeEndClassName = cn(
    buttonRangeClassName,
    "day-range-end rounded-e-md",
    props.rangeEndClassName,
  );
  const _rangeMiddleClassName = cn(
    "bg-accent !text-foreground [&>button]:!text-foreground [&>button]:hover:!text-foreground [&>button]:bg-transparent [&>button]:hover:bg-transparent",
    props.rangeMiddleClassName,
  );
  const _selectedClassName = cn(
    "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground",
    "rounded-[4px] bg-green-500",
    props.selectedClassName,
  );
  const _todayClassName = cn(
    "[&>button]:bg-accent [&>button]:text-accent-foreground",
    props.todayClassName,
  );
  const _outsideClassName = cn(
    "day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground opacity-50 aria-selected:opacity-30",
    props.outsideClassName,
  );
  const _disabledClassName = cn(
    "text-gray-300 cursor-not-allowed",
    props.disabledClassName,
  );
  const _hiddenClassName = cn("invisible flex-1", props.hiddenClassName);

  return (
    <DayPicker
      mode="single"
      showOutsideDays={showOutsideDays}
      numberOfMonths={columnsDisplayed}
      disabled={disabledDates}
      className={cn(
        "w-auto p-3 dark:border-gray-900 dark:bg-slate-600",
        className,
      )}
      classNames={{
        months: _monthsClassName,
        month_caption: _monthCaptionClassName,
        weekdays: _weekdaysClassName,
        weekday: _weekdayClassName,
        month: _monthClassName,
        caption: _captionClassName,
        caption_label: _captionLabelClassName,
        button_next: _buttonNextClassName,
        button_previous: _buttonPreviousClassName,
        nav: _navClassName,
        month_grid: _monthGridClassName,
        week: _weekClassName,
        day: _dayClassName,
        day_button: _dayButtonClassName,
        range_start: _rangeStartClassName,
        range_middle: _rangeMiddleClassName,
        range_end: _rangeEndClassName,
        selected: _selectedClassName,
        today: _todayClassName,
        outside: _outsideClassName,
        disabled: _disabledClassName,
        hidden: _hiddenClassName,
      }}
      components={{
        Chevron: () => {
          return <Icon className="size-4" name="ArrowLeft" />;
        },
        Nav: ({ className }) => {
          return (
            <NavCalendar
              navView={navView}
              displayYears={displayYears}
              onPrevClick={onPrevClick}
              onNextClick={onNextClick}
              setDisplayYears={setDisplayYears}
              className={className}
              buttonPreviousClassName={props.buttonPreviousClassName}
              buttonNextClassName={props.buttonNextClassName}
              startMonth={startMonth}
              endMonth={endMonth}
              {...props}
            />
          );
        },

        CaptionLabel: ({ children, ...props }) => (
          <CaptionLabel
            navView={navView}
            setNavView={setNavView}
            showYearSwitcher={showYearSwitcher}
            {...props}
          >
            {children}
          </CaptionLabel>
        ),
        MonthGrid: ({ className, children, ...props }) => {
          const { goToMonth, months } = useDayPicker();
          const actualYear = format(months[0].date, "yyyy");
          const actualMonth = format(months[0].date, "MMMM");
          if (navView === "years") {
            return (
              <div className="mt-[18px] flex flex-col gap-2">
                <CalendarDateHeader navView={navView} setNavView={setNavView} />

                <div
                  className={cn(
                    "grid grid-cols-3  gap-x-[14px] gap-y-[15px]",
                    className,
                  )}
                  {...props}
                >
                  {Array.from(
                    { length: displayYears.to - displayYears.from + 1 },
                    (_, i) => {
                      const isBefore =
                        differenceInCalendarDays(
                          new Date(displayYears.from + i, 11, 31),
                          startMonth!,
                        ) < 0;

                      const isAfter =
                        differenceInCalendarDays(
                          new Date(displayYears.from + i, 0, 0),
                          endMonth!,
                        ) > 0;

                      const isDisabled = isBefore || isAfter;
                      return (
                        <Button
                          key={i}
                          className={cn(
                            "h-[28px] w-[68px] rounded-[4px] text-[12px] leading-[18px] text-gray-900",
                            displayYears.from + i ===
                              new Date().getFullYear() &&
                              "text-accent-foreground bg-gray-100 font-medium",

                            // hover
                            "hover:bg-gray-100",
                            displayYears.from + i ===
                              months[0].date.getFullYear() &&
                              "bg-gray-900 text-white hover:bg-gray-900",
                          )}
                          variant="ghost"
                          onClick={() => {
                            goToMonth(
                              new Date(
                                displayYears.from + i,
                                MONTHS.indexOf(actualMonth),
                              ),
                            );
                          }}
                          disabled={
                            navView === "years" ? isDisabled : undefined
                          }
                        >
                          {displayYears.from + i}
                        </Button>
                      );
                    },
                  )}
                </div>
              </div>
            );
          }
          if (navView === "months") {
            return (
              <div className="mt-[15px] flex flex-col gap-3">
                <CalendarDateHeader navView={navView} setNavView={setNavView} />

                <div className="grid grid-cols-3  gap-x-[14px] gap-y-[15px]">
                  {MONTHS.flat().map((month) => (
                    <Button
                      key={month}
                      variant="ghost"
                      className={cn(
                        "w-full px-[2px] py-[5px] text-[12px] leading-[18px] text-gray-900",

                        month === actualMonth &&
                          "bg-gray-900 hover:bg-gray-900",

                        // hover
                        "hover:bg-gray-100",
                        month === actualMonth &&
                          "bg-gray-900 text-white hover:bg-gray-900",
                      )}
                      onClick={() => {
                        goToMonth(
                          new Date(parseInt(actualYear), MONTHS.indexOf(month)),
                        );
                      }}
                    >
                      {month}
                    </Button>
                  ))}
                </div>
              </div>
            );
          }
          return (
            <table className={className} {...props}>
              {children}
            </table>
          );
        },
      }}
      {...props}
    />
  );
};
Calendar.displayName = "Calendar";

export { Calendar };
