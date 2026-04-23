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
      // `BrowserPackageManager` raises a generic "Failed to fetch dynamically
      // imported module" when the registry CDN returns an error. That covers
      // both "the name exists nowhere (not on this registry AND not on the
      // npmjs uplink)" and "the tarball is there but doesn't look like a
      // Powerhouse package". Tell the user in plain terms before dumping the
      // raw error so the "install from npm" fallback case is self-explanatory.
      const isLikelyNotFound = /failed to fetch|404|not found/i.test(message);
      const userMessage = isLikelyNotFound
        ? `Could not install "${packageSpec}". The package isn't available on this registry, and the npmjs.org fallback could not resolve it either.`
        : `Failed to install "${packageSpec}": ${message}`;
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
      const message = error instanceof Error ? error.message : "Unknown error";
      toast(`Failed to uninstall "${packageName}": ${message}`, {
        type: "error",
      });
    }
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <PackageManager
        mutable={true}
        registryPackageList={registryPackageList}
        onInstall={handleInstall}
        onUninstall={handleUninstall}
      />
    </div>
  );
};
