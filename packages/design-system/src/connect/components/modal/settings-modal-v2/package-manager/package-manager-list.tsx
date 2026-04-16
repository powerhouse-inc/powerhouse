import { Icon } from "#design-system";
import type {
  RegistryPackage,
  RegistryPackageList,
} from "@powerhousedao/shared/registry";
import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
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
      <h3 className="font-semibold text-gray-900">
        {registryPackage.name}
        {registryPackage.version ? (
          <span className="ml-2 text-xs font-normal text-gray-500">
            v{registryPackage.version}
          </span>
        ) : null}
      </h3>
      {registryPackage.manifest !== null &&
        (() => {
          const { description, category, publisher } = registryPackage.manifest;
          const hasAnyField =
            description != null ||
            category != null ||
            publisher?.name != null ||
            publisher?.url != null;
          if (!hasAnyField) return null;
          return (
            <>
              {description != null && (
                <PackageDetail label="Description" value={description} />
              )}
              {category != null && (
                <PackageDetail label="Category" value={category} />
              )}
              {publisher?.name != null && (
                <PackageDetail label="Publisher" value={publisher.name} />
              )}
              {publisher?.url != null && (
                <PackageDetail
                  label="Publisher URL"
                  value={
                    <a className="underline" href={publisher.url}>
                      {publisher.url}
                    </a>
                  }
                />
              )}
            </>
          );
        })()}
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
  const hasAnyInstalled = hasLocallyInstalled || hasRegistryInstalled;
  const hasAvailable = availablePackages.length > 0;
  const hasDismissed = dismissedPackages.length > 0;
  const installedCount =
    locallyInstalledPackages.length + registryInstalledPackages.length;

  return (
    <div
      className={twMerge(
        "flex flex-col items-stretch overflow-hidden",
        className,
      )}
      style={{ maxHeight }}
    >
      <div className="flex-1 overflow-y-auto pr-2">
        <PackageSection
          sectionId="installed"
          title="Installed Packages"
          count={installedCount}
          isEmpty={!hasAnyInstalled}
          emptyText="No packages installed."
        >
          {hasLocallyInstalled && (
            <PackageSubSection
              title="Locally installed"
              count={locallyInstalledPackages.length}
            >
              <PackageList
                packages={locallyInstalledPackages}
                onInstall={onInstall}
                onUninstall={onUninstall}
              />
            </PackageSubSection>
          )}
          {hasRegistryInstalled && (
            <PackageSubSection
              title="Installed from registry"
              count={registryInstalledPackages.length}
            >
              <PackageList
                packages={registryInstalledPackages}
                onInstall={onInstall}
                onUninstall={onUninstall}
              />
            </PackageSubSection>
          )}
        </PackageSection>

        <PackageSection
          sectionId="available"
          title="Available Packages"
          count={availablePackages.length}
          isEmpty={!hasAvailable}
          emptyText="No packages available to install."
        >
          <PackageList
            packages={availablePackages}
            onInstall={onInstall}
            onUninstall={onUninstall}
          />
        </PackageSection>

        {hasDismissed && (
          <PackageSection
            sectionId="dismissed"
            title="Dismissed Packages"
            count={dismissedPackages.length}
          >
            <PackageList
              packages={dismissedPackages}
              onInstall={onInstall}
              onUninstall={onUninstall}
            />
          </PackageSection>
        )}
      </div>
    </div>
  );
};

const STORAGE_KEY = "ph:package-manager:collapsed-sections";

function loadCollapsedSections(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function useCollapsedSection(sectionId: string): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(
    () => loadCollapsedSections()[sectionId] ?? true,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const current = loadCollapsedSections();
      current[sectionId] = collapsed;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // ignore persistence errors
    }
  }, [sectionId, collapsed]);

  const toggle = useCallback(() => setCollapsed((prev) => !prev), []);
  return [collapsed, toggle];
}

const PackageSection: React.FC<{
  sectionId: string;
  title: string;
  count: number;
  isEmpty?: boolean;
  emptyText?: string;
  children?: ReactNode;
}> = ({ sectionId, title, count, isEmpty, emptyText, children }) => {
  const [collapsed, toggle] = useCollapsedSection(sectionId);
  const contentId = `package-section-${sectionId}`;

  return (
    <section className="mb-6">
      <h3 className="sticky top-0 z-10 mb-3 border-b border-gray-200 bg-white">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          className="flex w-full items-center gap-2 pb-2 text-left text-base font-semibold text-gray-900 hover:text-gray-700"
        >
          <Icon
            name="ChevronDown"
            size={16}
            className={twMerge(
              "shrink-0 text-gray-500 transition-transform",
              collapsed && "-rotate-90",
            )}
          />
          <span>{title}</span>
          <span className="text-xs font-medium text-gray-500">{count}</span>
        </button>
      </h3>
      {!collapsed && (
        <div id={contentId}>
          {isEmpty ? (
            <p className="text-sm text-gray-500">{emptyText}</p>
          ) : (
            <div className="flex flex-col gap-4">{children}</div>
          )}
        </div>
      )}
    </section>
  );
};

const PackageSubSection: React.FC<{
  title: string;
  count: number;
  children: ReactNode;
}> = ({ title, count, children }) => {
  return (
    <div>
      <h4 className="mb-2 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <span>{title}</span>
        <span className="font-medium normal-case tracking-normal text-gray-400">
          ({count})
        </span>
      </h4>
      {children}
    </div>
  );
};

const PackageList: React.FC<{
  packages: RegistryPackageList;
  onInstall: (packageName: string) => Promise<void>;
  onUninstall: (packageName: string) => void;
}> = ({ packages, onInstall, onUninstall }) => {
  return (
    <ul className="flex flex-col items-stretch gap-4 pr-2">
      {packages.map((pkg) => (
        <PackageManagerListItem
          key={pkg.name}
          registryPackage={pkg}
          onInstall={onInstall}
          onUninstall={onUninstall}
        />
      ))}
    </ul>
  );
};
