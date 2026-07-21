import { useRegistryPackages } from "@powerhousedao/connect/hooks";
import { toast } from "@powerhousedao/connect/services";
import { PackageManager } from "@powerhousedao/design-system/connect";
import { useVetraPackageManager } from "@powerhousedao/reactor-browser";
import React from "react";

/**
 * Split a `name@tag` spec into its bare package name. Mirrors the design-system's
 * `parsePackageSpec` — duplicated here to avoid reaching into a deep subpath
 * export. Scoped names split on the LAST `@`, unscoped on the first.
 */
function parseBareName(spec: string): string {
  const trimmed = spec.trim();
  const at = trimmed.startsWith("@")
    ? trimmed.lastIndexOf("@")
    : trimmed.indexOf("@");
  return at > 0 ? trimmed.slice(0, at) : trimmed;
}

export const ConnectPackageManager: React.FC = () => {
  const packageManager = useVetraPackageManager();
  const {
    registryPackageList,
    installedPackages,
    availablePackages,
    availableHasMore,
    isLoadingAvailable,
    isLoadingMoreAvailable,
    availableError,
    ensureAvailableLoaded,
    fetchAvailablePage,
    loadMoreAvailable,
    setAvailableSearch,
    updateRegistryPackageStatus,
    registerFallbackRegistryPackage,
  } = useRegistryPackages();

  async function handleInstall(packageSpec: string) {
    if (!packageManager) return;

    // The spec may include an explicit `@tag` / `@version` suffix from the
    // search input. Pass it through to the package manager as-is (the CDN
    // route already handles `name@tag` specs), but track status under the
    // bare name so the Settings list doesn't fragment.
    const bareName = parseBareName(packageSpec);
    // Packages that were in `/packages` when the user clicked Install go
    // through `updateRegistryPackageStatus` and hit an existing entry.
    // Packages that landed via the npm-uplink fallback weren't in the list,
    // so we register them explicitly rather than silently upserting a
    // placeholder — keeping the "does not exist" error as a signal for any
    // other code path that reaches update without a matching entry.
    const wasKnownToRegistry = registryPackageList.some(
      (p) => p.name === bareName,
    );
    const result = await packageManager.addPackage(packageSpec);
    if (result.type === "success") {
      if (wasKnownToRegistry) {
        updateRegistryPackageStatus(bareName, "registry-install");
      } else {
        registerFallbackRegistryPackage(
          bareName,
          result.package,
          packageManager.getPackageVersion(bareName) ??
            packageManager.getPackageVersion(packageSpec),
          "registry-install",
        );
      }
      toast(`Package "${packageSpec}" installed successfully`, {
        type: "connect-success",
      });
    } else {
      const message = result.error.message;
      console.error(
        `[Connect][PackageManager] Install failed for "${packageSpec}":`,
        result.error,
      );
      // `BrowserPackageManager` raises a generic "Failed to fetch dynamically
      // imported module" when the registry CDN returns an error. That covers
      // both "the name exists nowhere (not on this registry AND not on the
      // npmjs uplink)" and "the tarball is there but doesn't look like a
      // Powerhouse package". Map to plain-language copy — never dump the raw
      // API / loader message into the toast.
      const isLikelyNotFound = /failed to fetch|404|not found/i.test(message);
      const userMessage = isLikelyNotFound
        ? `Couldn't install "${packageSpec}". It isn't available on this registry or via npm.`
        : `Couldn't install "${packageSpec}". Please try again.`;
      toast(userMessage, { type: "error" });
    }
  }

  function handleUninstall(packageName: string) {
    if (!packageManager) return;
    try {
      packageManager.removePackage(packageName);
      updateRegistryPackageStatus(packageName, "available");

      toast(`Package "${packageName}" uninstalled successfully`, {
        type: "connect-success",
      });
    } catch (error) {
      console.error(
        `[Connect][PackageManager] Uninstall failed for "${packageName}":`,
        error,
      );
      toast(`Couldn't uninstall "${packageName}". Please try again.`, {
        type: "error",
      });
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PackageManager
        mutable={true}
        installedPackages={installedPackages}
        availablePackages={availablePackages}
        isAvailableLoading={isLoadingAvailable}
        isLoadingMoreAvailable={isLoadingMoreAvailable}
        hasMoreAvailable={availableHasMore}
        onLoadMoreAvailable={loadMoreAvailable}
        availableError={availableError}
        onAvailableRetry={() => {
          void fetchAvailablePage({ reset: true });
        }}
        onAvailableSearchChange={setAvailableSearch}
        onAvailableTabOpen={ensureAvailableLoaded}
        onInstall={handleInstall}
        onUninstall={handleUninstall}
      />
    </div>
  );
};
