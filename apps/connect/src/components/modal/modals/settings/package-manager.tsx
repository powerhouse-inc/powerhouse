import { useRegistryPackages } from "@powerhousedao/connect/hooks";
import { toast } from "@powerhousedao/connect/services";
import { PackageManager } from "@powerhousedao/design-system/connect";
import { useVetraPackageManager } from "@powerhousedao/reactor-browser";
import React from "react";

export const ConnectPackageManager: React.FC = () => {
  const packageManager = useVetraPackageManager();
  const { registryPackageList, updateRegistryPackageStatus } =
    useRegistryPackages();

  async function handleInstall(packageName: string) {
    if (!packageManager) return;

    const result = await packageManager.addPackage(packageName);
    if (result.type === "success") {
      updateRegistryPackageStatus(packageName, "registry-install");
      toast(`Package "${packageName}" installed successfully`, {
        type: "connect-success",
      });
    } else {
      const message = result.error.message;
      toast(`Failed to install "${packageName}": ${message}`, {
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
