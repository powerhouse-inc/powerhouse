import { cn } from "@/scalars/lib/utils";
import { Button } from "../../../fragments/button";
import { Icon } from "@/powerhouse";
import { type DatePickerView } from "../../types";

interface CaptionLabelProps extends React.PropsWithChildren {
  showYearSwitcher: boolean;
  navView: DatePickerView;
  setNavView: (navView: DatePickerView) => void;
}

const CaptionLabel: React.FC<CaptionLabelProps> = ({
  children,
  showYearSwitcher,
  navView,
  setNavView,
  ...props
}) => {
  if (!showYearSwitcher) return <span {...props}>{children}</span>;

  // Convert children to a string and split by space to separate the month and the year
  const [monthAbbreviation, yearNumber] = (children as string).split(" ");

  const isSelectedMonth = navView === "months";
  const isSelectedYear = navView === "years";

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-gray-600",
        isSelectedMonth ? "text-gray-900" : "text-gray-600",
      )}
    >
      <Button
        className="truncate text-sm font-semibold"
        variant="ghost"
        onClick={() => setNavView("months")}
      >
        {monthAbbreviation}
      </Button>
      <Button
        className={cn(
          "truncate text-sm font-semibold",
          isSelectedYear ? "text-gray-900" : "text-gray-600",
        )}
        variant="ghost"
        onClick={() => setNavView("years")}
      >
        {yearNumber}
      </Button>
      {navView === "days" ? (
        <Icon className="size-[18px] text-gray-600" name="TriangleDown" />
      ) : (
        <Button variant="ghost" onClick={() => setNavView("days")}>
          <Icon className="size-[18px] text-gray-900" name="CrossCircle" />
        </Button>
      )}
    </div>
  );
};

export default CaptionLabel;
