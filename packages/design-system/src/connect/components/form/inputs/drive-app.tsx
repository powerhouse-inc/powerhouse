import type { DivProps, DriveLocation } from "#design-system";
import { Icon } from "#design-system";
import { twMerge } from "tailwind-merge";

type DriveAppProps = DivProps & {
  readonly location: DriveLocation;
};

export function DriveApp(props: DriveAppProps) {
  const { location: _location, className, ...divProps } = props;

  return (
    <div
      {...divProps}
      className={twMerge(
        "flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 p-3 text-gray-900 dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100",
        className,
      )}
    >
      <Icon name="Server" />
      <div>
        <p>Drive Generic Explorer</p>
        <p className="text-xs text-gray-700 dark:text-slate-200">
          Built by Powerhouse
        </p>
      </div>
    </div>
  );
}
