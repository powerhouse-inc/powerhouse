import { useMemo } from "react";
import { twMerge } from "tailwind-merge";
import type { PackageManagerInputProps } from "./package-manager-input.js";
import { PackageManagerInput } from "./package-manager-input.js";
import type { PackageManagerListProps } from "./package-manager-list.js";
import { PackageManagerList } from "./package-manager-list.js";
import type { PackageManagerReactorSelectProps } from "./package-manager-select.js";
import { PackageManagerReactorSelect } from "./package-manager-select.js";

type Props = PackageManagerReactorSelectProps &
  PackageManagerInputProps &
  PackageManagerListProps;

export const PackageManager: React.FC<Props> = (props) => {
  const {
    className,
    reactorOptions,
    reactor,
    onReactorChange,
    onInstall,
    packages,
    onUninstall,
    mutable,
    packageOptions,
    ...rest
  } = props;

  const packageOptionsSet = useMemo(
    () =>
      packageOptions?.filter(
        (o) => !packages.find((p) => p.name === o.packageName),
      ),
    [packages, packageOptions],
  );
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
        reactorOptions={reactorOptions}
        onReactorChange={onReactorChange}
        className="mb-4"
      />
      {mutable && (
        <PackageManagerInput
          onInstall={onInstall}
          packageOptions={packageOptionsSet}
        />
      )}
      <PackageManagerList
        packages={packages}
        onUninstall={onUninstall}
        mutable={mutable}
      />
    </div>
  );
};
