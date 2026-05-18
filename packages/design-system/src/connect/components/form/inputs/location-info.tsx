import type { DivProps, DriveLocation } from "#design-system";
import { twMerge } from "tailwind-merge";
import { locationInfoByLocation } from "../../../constants/options.js";
type LocationInfoProps = DivProps & {
  readonly location: DriveLocation;
};

export function LocationInfo(props: LocationInfoProps) {
  const { location, className, ...divProps } = props;

  const locationInfo = locationInfoByLocation[location];
  return (
    <div
      {...divProps}
      className={twMerge(
        "my-3 flex items-center gap-2 rounded-xl border border-gray-100 bg-white p-3 text-gray-800 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50",
        className,
      )}
    >
      {locationInfo.icon}
      <div>
        <p>{locationInfo.title}</p>
        <p className="text-xs text-slate-200 dark:text-gray-400">
          {locationInfo.description}
        </p>
      </div>
    </div>
  );
}
