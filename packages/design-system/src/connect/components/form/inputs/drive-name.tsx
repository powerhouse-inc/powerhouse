import { Icon } from "#design-system";

type DriveNameProps = {
  readonly driveName: string;
};
export function DriveName(props: DriveNameProps) {
  return (
    <div className="flex gap-2 rounded-xl bg-gray-100 p-3 font-semibold text-gray-500 dark:bg-slate-700 dark:text-slate-400">
      <Icon className="text-gray-600 dark:text-slate-300" name="Drive" />
      {props.driveName}
    </div>
  );
}
