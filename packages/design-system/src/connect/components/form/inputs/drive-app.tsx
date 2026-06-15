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
        "flex items-center gap-2 rounded-md border border-border bg-background p-3 text-foreground",
        className,
      )}
    >
      <Icon name="Server" />
      <div>
        <p>Drive Generic Explorer</p>
        <p className="text-xs text-foreground">Built by Powerhouse</p>
      </div>
    </div>
  );
}
