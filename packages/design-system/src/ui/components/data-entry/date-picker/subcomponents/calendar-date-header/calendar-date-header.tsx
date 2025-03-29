import { cn } from "#scalars";
import { Button } from "../../../../../../scalars/components/fragments/button/index.js";
import { type DatePickerView } from "../../types.js";
type CalendarDateHeaderProps = {
  navView: DatePickerView;
  setNavView: (navView: DatePickerView) => void;
};

const CalendarDateHeader = ({
  navView,
  setNavView,
}: CalendarDateHeaderProps) => {
  return (
    <div className="flex flex-row justify-between">
      <Button
        variant="ghost"
        onClick={() => setNavView("years")}
        className={cn(
          "w-[114px] py-2 text-gray-500",
          "rounded-[6px] border border-gray-200 bg-white",
          navView === "years" && "bg-gray-100",
        )}
      >
        Year
      </Button>
      <Button
        variant="ghost"
        onClick={() => setNavView("months")}
        className={cn(
          "w-[114px] py-2 text-gray-500",
          "rounded-[6px] border border-gray-200 bg-white",
          navView === "months" && "bg-gray-100",
        )}
      >
        Month
      </Button>
    </div>
  );
};

export default CalendarDateHeader;
