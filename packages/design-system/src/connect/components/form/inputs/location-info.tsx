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
        "my-3 flex items-center gap-2 rounded-xl border border-border bg-background p-3 text-foreground shadow-sm",
        className,
      )}
    >
      {locationInfo.icon}
      <div>
        <p>{locationInfo.title}</p>
        <p className="text-xs text-foreground">{locationInfo.description}</p>
      </div>
    </div>
  );
}
