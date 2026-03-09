import { twMerge } from "tailwind-merge";
import type { PackageManagerInputProps } from "./package-manager-input.js";
import { PackageManagerInput } from "./package-manager-input.js";
import type {
  PackageDetails,
  PackageManagerListProps,
} from "./package-manager-list.js";
import { PackageManagerList } from "./package-manager-list.js";
import type { PackageManagerRegistrySelectProps } from "./package-manager-select.js";
import { PackageManagerRegistrySelect } from "./package-manager-select.js";

type Props = PackageManagerRegistrySelectProps &
  PackageManagerInputProps &
  PackageManagerListProps & {
    availablePackages?: PackageDetails[];
  };

export const PackageManager: React.FC<Props> = (props) => {
  const {
    className,
    registries,
    selectedRegistryId,
    onRegistryChange,
    registryStatus,
    customRegistryUrl,
    onCustomRegistryUrlChange,
    onInstall,
    fetchPackages,
    packages,
    availablePackages,
    onUninstall,
    mutable,
    disabled,
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
      <PackageManagerRegistrySelect
        registries={registries}
        selectedRegistryId={selectedRegistryId}
        onRegistryChange={onRegistryChange}
        registryStatus={registryStatus}
        customRegistryUrl={customRegistryUrl}
        onCustomRegistryUrlChange={onCustomRegistryUrlChange}
        className="mb-4"
      />
      {mutable && (
        <PackageManagerInput
          className="mb-4"
          onInstall={onInstall}
          fetchPackages={fetchPackages}
          disabled={disabled}
        />
      )}
      <PackageManagerList
        packages={packages}
        availablePackages={availablePackages}
        onUninstall={onUninstall}
        mutable={mutable}
      />
    </div>
  );
};
