import { ComponentPropsWithoutRef } from "react";
import { twMerge } from "tailwind-merge";
import {
  PackageManagerInput,
  PackageManagerInputProps,
} from "./package-manager-input";
import {
  PackageManagerList,
  PackageManagerListProps,
} from "./package-manager-list";
import {
  PackageManagerReactorSelect,
  PackageManagerReactorSelectProps,
} from "./package-manager-select";

export type PackageManagerProps = PackageManagerReactorSelectProps &
  PackageManagerInputProps &
  PackageManagerListProps &
  ComponentPropsWithoutRef<"div">;
export const PackageManager: React.FC<PackageManagerProps> = (props) => {
  const {
    className,
    options,
    reactor,
    onReactorChange,
    onInstall,
    packages,
    onUninstall,
    ...rest
  } = props;
  return (
    <div
      {...rest}
      className={twMerge(
        "flex h-full flex-1 flex-col rounded-lg p-3",
        className,
      )}
    >
      <PackageManagerReactorSelect
        reactor={reactor}
        options={options}
        onReactorChange={onReactorChange}
        className="mb-4"
      />
      <PackageManagerInput onInstall={onInstall} />
      <PackageManagerList packages={packages} onUninstall={onUninstall} />
    </div>
  );
};
