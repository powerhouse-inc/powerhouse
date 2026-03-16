import type { RegistryPackageList } from "@powerhousedao/shared/registry";
import { twMerge } from "tailwind-merge";
import { PackageManagerInput } from "./package-manager-input.js";
import { PackageManagerList } from "./package-manager-list.js";

type Props = {
  registryPackageList: RegistryPackageList;
  mutable: boolean;
  onInstall: (packageName: string) => Promise<void>;
  onUninstall: (packageName: string) => void;
  disabled?: boolean;
  className?: string;
};

export const PackageManager: React.FC<Props> = (props) => {
  const {
    registryPackageList,
    onInstall,
    onUninstall,
    mutable,
    disabled,
    className,
  } = props;

  return (
    <div
      className={twMerge(
        "flex h-full flex-1 flex-col rounded-lg p-3",
        className,
      )}
    >
      {mutable && (
        <PackageManagerInput
          className="mb-4"
          registryPackageList={registryPackageList}
          onInstall={onInstall}
          disabled={disabled}
        />
      )}
      <PackageManagerList
        registryPackageList={registryPackageList}
        onUninstall={onUninstall}
        onInstall={onInstall}
      />
    </div>
  );
};
