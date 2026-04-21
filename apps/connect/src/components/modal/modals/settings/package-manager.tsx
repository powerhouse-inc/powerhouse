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
  const { registryPackageList, updateRegistryPackageStatus } =
    useRegistryPackages();

  async function handleInstall(packageSpec: string) {
    if (!packageManager) return;

    // The spec may include an explicit `@tag` / `@version` suffix from the
    // search input. Pass it through to the package manager as-is (the CDN
    // route already handles `name@tag` specs), but track status under the
    // bare name so the Settings list doesn't fragment.
    const result = await packageManager.addPackage(packageSpec);
    const bareName = parseBareName(packageSpec);
    if (result.type === "success") {
      updateRegistryPackageStatus(bareName, "registry-install");
      toast(`Package "${packageSpec}" installed successfully`, {
        type: "connect-success",
      });
    } else {
      const message = result.error.message;
      toast(`Failed to install "${packageSpec}": ${message}`, {
        type: "error",
      });
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
