import type { RegistryPackageList } from "@powerhousedao/shared/registry";
import { filterPackages } from "./filter-packages.js";
import {
  PackageList,
  PackagePanelScrollArea,
  PackageSubSection,
} from "./package-manager-list.js";
import { PackageSearchInput } from "./package-search-input.js";

export type InstalledPackagesPanelProps = {
  /** status: local-install | registry-install */
  packages: RegistryPackageList;
  query: string;
  onQueryChange: (query: string) => void;
  onInstall: (packageSpec: string) => Promise<void>;
  onUninstall: (packageName: string) => void;
  disabled?: boolean;
};

export const InstalledPackagesPanel: React.FC<InstalledPackagesPanelProps> = (
  props,
) => {
  const { packages, query, onQueryChange, onInstall, onUninstall, disabled } =
    props;

  const filtered = filterPackages(packages, query);
  const locallyInstalled = filtered.filter((p) => p.status === "local-install");
  const registryInstalled = filtered.filter(
    (p) => p.status === "registry-install",
  );

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="pr-3">
        <PackageSearchInput
          value={query}
          onChange={onQueryChange}
          placeholder="Search installed packages"
          disabled={disabled}
        />
      </div>
      <PackagePanelScrollArea>
        {packages.length === 0 ? (
          <p className="text-sm text-foreground">No packages installed.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-foreground">
            No installed packages match your search.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {locallyInstalled.length > 0 && (
              <PackageSubSection
                title="Locally installed"
                count={locallyInstalled.length}
              >
                <PackageList
                  packages={locallyInstalled}
                  onInstall={onInstall}
                  onUninstall={onUninstall}
                />
              </PackageSubSection>
            )}
            {registryInstalled.length > 0 && (
              <PackageSubSection
                title="Installed from registry"
                count={registryInstalled.length}
              >
                <PackageList
                  packages={registryInstalled}
                  onInstall={onInstall}
                  onUninstall={onUninstall}
                />
              </PackageSubSection>
            )}
          </div>
        )}
      </PackagePanelScrollArea>
    </div>
  );
};
