import { Icon } from "@powerhousedao/design-system";

type DriveNameProps = {
  readonly driveName: string;
};
export function DriveName(props: DriveNameProps) {
  return (
    <div className="flex gap-2 rounded-xl bg-gray-100 p-3 font-semibold text-gray-500">
      <Icon className="text-gray-600" name="Drive" />
      {props.driveName}
    </div>
  );
}
