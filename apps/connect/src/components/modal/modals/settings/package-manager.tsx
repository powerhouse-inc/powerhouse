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
    try {
      await packageManager?.addPackage(packageName);
      updateRegistryPackageStatus(packageName, "installed");
      toast(`Package "${packageName}" installed successfully`, {
        type: "connect-success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast(`Failed to install "${packageName}": ${message}`, {
        type: "error",
      });
    }
  }

  function handleUninstall(packageName: string) {
    try {
      packageManager?.removePackage(packageName);
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
