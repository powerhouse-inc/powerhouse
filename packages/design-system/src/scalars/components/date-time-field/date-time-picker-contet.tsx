import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radix-ui/react-tabs";
import { Icon } from "#powerhouse";
import { cn } from "../../lib/utils";
import { Calendar } from "../date-picker-field/subcomponents/calendar/calendar";
import { type SelectBaseProps } from "../enum-field/types";
import { type SelectFieldProps } from "../fragments";
import TimePickerContent from "../time-picker-field/subcomponents/time-picker-content";

interface DateTimePickerContentProps {
  className?: string;
  activeTab: "date" | "time";
  onChangeTabs: (value: string) => void;
  // Date Time Field
  selectedHour: string;
  selectedMinute: string;
  selectedPeriod: "AM" | "PM" | undefined;
  setSelectedHour: (hour: string) => void;
  setSelectedMinute: (minute: string) => void;
  setSelectedPeriod: (period?: "AM" | "PM") => void;
  hours: string[];
  minutes: string[];
  timeZonesOptions: SelectBaseProps["options"];
  selectProps?: Omit<SelectFieldProps, "name" | "options" | "selectionIcon">;
  is12HourFormat: boolean;
  isDisableSelect: boolean;
}

const DateTimePickerContent = ({
  className,
  activeTab,
  onChangeTabs,

  // Date Time Field
  selectedHour,
  selectedMinute,
  selectedPeriod,
  setSelectedHour,
  setSelectedMinute,
  setSelectedPeriod,
  hours,
  minutes,
  timeZonesOptions,
  selectProps,
  is12HourFormat,
  isDisableSelect,
}: DateTimePickerContentProps) => {
  return (
    <div className={cn("mx-auto w-full max-w-md", className)}>
      <Tabs value={activeTab} onValueChange={onChangeTabs} className="w-full">
        <TabsList className="mb-4 grid h-8 w-full grid-cols-2 bg-white">
          <TabsTrigger
            value="date"
            className={cn(
              "relative transition-all duration-200",
              "flex h-full items-center justify-center",
              "border-b-2",
              activeTab === "date"
                ? "border-gray-900 font-medium text-gray-900"
                : "border-gray-100 text-gray-300 hover:border-gray-100 hover:text-gray-300",
            )}
          >
            <Icon name="CalendarTime" className="h-6 w-6" />
          </TabsTrigger>
          <TabsTrigger
            value="time"
            className={cn(
              "relative transition-all duration-200",
              "flex h-full items-center justify-center",
              "border-b-2",
              activeTab === "time"
                ? "border-gray-900 font-medium text-gray-900"
                : "border-transparent text-gray-300 hover:border-gray-100 hover:text-gray-300",
            )}
          >
            <Icon name="Clock" className="h-6 w-6" />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="date">
          <Calendar
            mode="single"
            selected={undefined}
            weekStartsOn={0}
            onSelect={() => {}}
            disabled={[]}
            onDayClick={() => {}}
            className={cn(
              "w-full",
              "p-0",
              // dark
              "dark:text-gray-500",
              // custom styles
              "font-inter",
              "text-[14px]",
              "font-semibold",
              "leading-[22px]",
            )}
            weekdaysClassName={cn(
              "h-[34px]",
              "gap-x-[3px]",
              "dark:text-gray-600",
            )}
            monthGridClassName={cn("w-full", "px-[5.5px]")}
            dayClassName={cn(
              "w-[34px] cursor-pointer text-[12px] hover:rounded-[4px] hover:bg-gray-200 text-gray-900",
              // dark
              "dark:text-gray-50 hover:dark:bg-gray-900",
              "disabled:text-gray-300",
            )}
            buttonPreviousClassName={cn(
              "border border-gray-200",
              // hover
              "hover:bg-gray-100  hover:border-gray-300 hover:text-gray-900 dark:hover:bg-gray-900",
              // dark
              "dark:border-gray-900 dark:text-gray-300",
            )}
            buttonNextClassName={cn(
              "border border-gray-200 ",
              // hover
              "hover:bg-gray-100  hover:border-gray-300 hover:text-gray-900 dark:hover:bg-gray-900",
              // dark
              "dark:border-gray-900 dark:text-gray-300",
            )}
            todayClassName={cn(
              "rounded-[4px]",
              "bg-gray-100",
              // dark
              "dark:bg-gray-900 dark:text-gray-50",
            )}
            selectedClassName={cn(
              "rounded-[4px]",
              "bg-gray-900 text-white",
              "hover:bg-gray-900 hover:text-white",
              // dark
              "dark:bg-gray-50 dark:text-gray-900",
              "dark:hover:bg-gray-50 dark:hover:text-gray-900",
            )}
            dayButtonClassName={cn("text-[12px] font-medium")}
            weekClassName={cn("w-full")}
            disabledClassName={cn(
              "!text-gray-300 !cursor-not-allowed hover:!bg-transparent [&>button]:hover:!bg-transparent",
            )}
          />
        </TabsContent>

        <TabsContent value="time">
          {/* WIP:Add the rest of props */}
          <TimePickerContent
            selectedHour={selectedHour}
            selectedMinute={selectedMinute}
            selectedPeriod={selectedPeriod}
            setSelectedHour={setSelectedHour}
            setSelectedMinute={setSelectedMinute}
            setSelectedPeriod={setSelectedPeriod}
            hours={hours}
            minutes={minutes}
            onSave={() => {}}
            onCancel={() => {}}
            timeZonesOptions={timeZonesOptions}
            selectProps={selectProps}
            is12HourFormat={is12HourFormat}
            isDisableSelect={isDisableSelect}
            selectedTimeZone={""}
            setSelectedTimeZone={() => {}}
            timeZone={""}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DateTimePickerContent;
