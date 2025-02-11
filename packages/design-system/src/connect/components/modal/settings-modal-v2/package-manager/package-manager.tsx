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
        reactorOptions={reactorOptions}
        onReactorChange={onReactorChange}
        className="mb-4"
      />
      {mutable && <PackageManagerInput onInstall={onInstall} />}
      <PackageManagerList
        packages={packages}
        onUninstall={onUninstall}
        mutable={mutable}
      />
    </div>
  );
};
