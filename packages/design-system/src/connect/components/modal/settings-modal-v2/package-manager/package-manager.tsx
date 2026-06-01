import type { RegistryPackageList } from "@powerhousedao/shared/registry";
import { twMerge } from "tailwind-merge";
import { PackageManagerInput } from "./package-manager-input.js";
import { PackageManagerList } from "./package-manager-list.js";

type Props = {
  registryPackageList: RegistryPackageList;
  mutable: boolean;
  /**
   * Install handler. The argument is the full spec the user chose — either
   * the bare package name, or `name@tag` / `name@version` when they typed
   * a suffix in the search input or picked one via the filter UI.
   */
  onInstall: (packageSpec: string) => Promise<void>;
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
        "flex h-full flex-1 flex-col rounded-lg bg-gray-50 p-3 text-gray-900 dark:bg-slate-800 dark:text-slate-100",
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
