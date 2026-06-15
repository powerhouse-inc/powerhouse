import { Icon } from "#design-system";

type DriveNameProps = {
  readonly driveName: string;
};
export function DriveName(props: DriveNameProps) {
  return (
    <div className="flex gap-2 rounded-xl bg-muted p-3 font-semibold text-muted-foreground">
      <Icon className="text-foreground" name="Drive" />
      {props.driveName}
    </div>
  );
}
