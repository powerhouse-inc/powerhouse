import { DriveLocation } from "@/connect";
import { DivProps, Icon } from "@/powerhouse";
import { twMerge } from "tailwind-merge";

type DriveAppProps = DivProps & {
  readonly location: DriveLocation;
};

export function DriveApp(props: DriveAppProps) {
  const { location, className, ...divProps } = props;

  return (
    <div
      {...divProps}
      className={twMerge(
        "flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-gray-800",
        className,
      )}
    >
      <Icon name="Server" />
      <div>
        <p>Drive Generic Explorer</p>
        <p className="text-xs text-gray-600">Built by Powerhouse</p>
      </div>
    </div>
  );
}
