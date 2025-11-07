import { twMerge } from "tailwind-merge";
import type { DivProps } from "../../../../powerhouse/types/helpers.js";
import { locationInfoByLocation } from "../../../constants/options.js";
import type { DriveLocation } from "../../../types/drives.js";

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
        "my-3 flex items-center gap-2 rounded-xl border border-gray-100 p-3 text-gray-800 shadow",
        className,
      )}
    >
      {locationInfo.icon}
      <div>
        <p>{locationInfo.title}</p>
        <p className="text-xs text-slate-200">{locationInfo.description}</p>
      </div>
    </div>
  );
}
