import { Icon } from "@powerhousedao/design-system";
import type {
  RegistryPackage,
  RegistryPackageList,
} from "@powerhousedao/shared/registry";
import type { ReactNode } from "react";
import { useLayoutEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { ConnectDropdownMenu } from "../../../dropdown-menu/dropdown-menu.js";

const PackageDetail: React.FC<{ label: string; value: ReactNode }> = ({
  label,
  value,
}) => {
  return (
    <div className="flex items-start gap-2 text-sm">
      <p className="text-gray-600">{label}:</p>
      <p className="text-gray-600">{value}</p>
    </div>
  );
};

export const PackageManagerListItem = (props: {
  registryPackage: RegistryPackage;
  onInstall: (packageName: string) => Promise<void>;
  onUninstall: (packageName: string) => void;
  className?: string;
}) => {
  const { registryPackage, onInstall, onUninstall, className } = props;
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);

  const installDropdownItem = {
    id: "install",
    label: "Install",
    icon: <Icon name="DownloadFile" />,
    className: "text-gray-800",
  } as const;

  const uninstallDropdownItem = {
    id: "uninstall",
    label: "Uninstall",
    icon: <Icon name="Trash" />,
    className: "text-red-900",
  } as const;

  function getDropdownItems() {
    return [
      registryPackage.status === "available" ||
      registryPackage.status === "dismissed"
        ? installDropdownItem
        : undefined,
      registryPackage.status === "registry-install"
        ? uninstallDropdownItem
        : undefined,
    ].filter((item) => item !== undefined);
  }

  const dropdownItems = getDropdownItems();
  return (
    <li
      className={twMerge(
        "relative flex flex-col items-start rounded-md border border-gray-200 p-3 text-sm leading-5 shadow-sm",
        className,
      )}
    >
      <h3 className="font-semibold text-gray-900">{registryPackage.name}</h3>
      {registryPackage.manifest !== null && (
        <>
          <PackageDetail
            label="Description"
            value={registryPackage.manifest.description}
          />
          <PackageDetail
            label="Category"
            value={registryPackage.manifest.category}
          />
          {registryPackage.manifest.publisher?.name !== undefined && (
            <>
              <PackageDetail
                label="Publisher"
                value={registryPackage.manifest.publisher.name}
              />
            </>
          )}
          {registryPackage.manifest.publisher?.url !== undefined && (
            <>
              <PackageDetail
                label="Publisher URL"
                value={
                  <a
                    className="underline"
                    href={registryPackage.manifest.publisher.url}
                  >
                    {registryPackage.manifest.publisher.url}
                  </a>
                }
              />
            </>
          )}
        </>
      )}
      <ConnectDropdownMenu
        items={dropdownItems}
        onItemClick={(id) => {
          if (id === "install") {
            onInstall(registryPackage.name).catch(console.error);
            return;
          }
          onUninstall(registryPackage.name);
        }}
        onOpenChange={setIsDropdownMenuOpen}
        open={isDropdownMenuOpen}
      >
        <button
          className="group absolute right-3 top-3"
          onClick={(e) => {
            e.stopPropagation();
            setIsDropdownMenuOpen(true);
          }}
        >
          <Icon
            className="text-gray-600 group-hover:text-gray-900"
            name="VerticalDots"
          />
        </button>
      </ConnectDropdownMenu>
    </li>
  );
};

export const PackageManagerList = (props: {
  registryPackageList: RegistryPackageList;
  onInstall: (packageName: string) => Promise<void>;
  onUninstall: (packageName: string) => void;
  className?: string;
}) => {
  const { className, registryPackageList, onInstall, onUninstall } = props;
  const [maxHeight, setMaxHeight] = useState<number | undefined>();
  const locallyInstalledPackages = registryPackageList.filter(
    (p) => p.status === "local-install",
  );
  const registryInstalledPackages = registryPackageList.filter(
    (p) => p.status === "registry-install",
  );
  const availablePackages = registryPackageList.filter(
    (p) => p.status === "available",
  );
  const dismissedPackages = registryPackageList.filter(
    (p) => p.status === "dismissed",
  );

  useLayoutEffect(() => {
    const calculateMaxHeight = () => {
      const viewportHeight = window.innerHeight;
      const availableHeight = viewportHeight - 516;
      setMaxHeight(Math.max(200, availableHeight));
    };

    calculateMaxHeight();

    window.addEventListener("resize", calculateMaxHeight);
    return () => window.removeEventListener("resize", calculateMaxHeight);
  }, []);

  const hasLocallyInstalled = locallyInstalledPackages.length > 0;
  const hasRegistryInstalled = registryInstalledPackages.length > 0;
  const hasAvailable = availablePackages.length > 0;
  const hasDismissed = dismissedPackages.length > 0;

  return (
    <div
      className={twMerge(
        "flex flex-col items-stretch overflow-hidden",
        className,
      )}
      style={{ maxHeight }}
    >
      <div className="flex-1 overflow-y-auto pr-2">
        <div className="mb-2">
          <h3 className="mb-4 font-semibold text-gray-900">
            Installed Packages
          </h3>
          {hasLocallyInstalled || hasRegistryInstalled ? (
            <div>
              <h4>Locally installed</h4>
              <ul className="flex flex-col items-stretch gap-4 pr-2">
                {locallyInstalledPackages.map((pkg) => (
                  <PackageManagerListItem
                    key={pkg.name}
                    registryPackage={pkg}
                    onInstall={onInstall}
                    onUninstall={onUninstall}
                  />
                ))}
              </ul>
              <h4>Installed from registry</h4>
              <ul className="flex flex-col items-stretch gap-4 pr-2">
                {registryInstalledPackages.map((pkg) => (
                  <PackageManagerListItem
                    key={pkg.name}
                    registryPackage={pkg}
                    onInstall={onInstall}
                    onUninstall={onUninstall}
                  />
                ))}
              </ul>
            </div>
          ) : (
            <p>No packages installed.</p>
          )}
        </div>
        <div className="mb-2">
          <h3 className="mb-4 font-semibold text-gray-900">
            Available Packages
          </h3>
          {hasAvailable ? (
            <ul className="flex flex-col items-stretch gap-4 pr-2">
              {availablePackages.map((pkg) => (
                <PackageManagerListItem
                  key={pkg.name}
                  registryPackage={pkg}
                  onInstall={onInstall}
                  onUninstall={onUninstall}
                />
              ))}
            </ul>
          ) : (
            <p>No packages available to install.</p>
          )}
        </div>
        {hasDismissed && (
          <>
            <h3 className="mb-4 font-semibold text-gray-900">
              Dismissed Packages
            </h3>
            <ul className="flex flex-col items-stretch gap-4 pr-2">
              {dismissedPackages.map((pkg) => (
                <PackageManagerListItem
                  key={pkg.name}
                  registryPackage={pkg}
                  onInstall={onInstall}
                  onUninstall={onUninstall}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};
