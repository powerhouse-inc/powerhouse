import {
  DismissedPackagesList,
  PackageManager,
} from "@powerhousedao/design-system/connect";
import type { PackageDetails } from "@powerhousedao/design-system/connect";
import {
  type BrowserPackageManager,
  makeVetraPackageManifest,
  useDismissedPackages,
  useVetraPackageManager,
  useVetraPackages,
} from "@powerhousedao/reactor-browser";
import React, { useCallback, useMemo } from "react";
import { toast } from "../../../../services/toast.js";
import { useRegistry } from "../../../../hooks/use-registry.js";

function toPackageDetails(
  pkg: ReturnType<typeof makeVetraPackageManifest>,
  removable: boolean,
): PackageDetails {
  return {
    id: pkg.id,
    name: pkg.name,
    description: pkg.description,
    category: pkg.category,
    publisher: pkg.author.name,
    publisherUrl: pkg.author.website ?? "",
    modules: Object.values(pkg.modules).flatMap((modules) =>
      modules.map((module) => module.name),
    ),
    removable,
  };
}

export const ConnectPackageManager: React.FC = () => {
  const packageManager = useVetraPackageManager() as
    | BrowserPackageManager
    | undefined;
  const vetraPackages = useVetraPackages();
  const dismissedPackages = useDismissedPackages();
  const {
    registries,
    selectedRegistryId,
    registryStatus,
    effectiveRegistryUrl,
    customRegistryUrl,
    setSelectedRegistryId,
    setCustomRegistryUrl,
    fetchPackages,
  } = useRegistry();

  const packagesInfo = useMemo(
    () => vetraPackages.map((pkg) => makeVetraPackageManifest(pkg)),
    [vetraPackages],
  );

  const { preInstalledPackages, installedPackages } = useMemo(() => {
    const localIds = packageManager?.localPackageIds ?? new Set<string>();
    const preInstalled: PackageDetails[] = [];
    const installed: PackageDetails[] = [];

    for (const pkg of packagesInfo) {
      const isLocal = localIds.has(pkg.id);
      if (isLocal) {
        preInstalled.push(toPackageDetails(pkg, false));
      } else {
        installed.push(toPackageDetails(pkg, true));
      }
    }

    return { preInstalledPackages: preInstalled, installedPackages: installed };
  }, [packagesInfo, packageManager]);

  const handleInstall = useCallback(
    async (packageName: string) => {
      if (!effectiveRegistryUrl) {
        throw new Error("No registry selected");
      }
      try {
        await packageManager?.addPackage(packageName, effectiveRegistryUrl);
        packageManager?.removeDismissed(packageName);
        toast(`Package "${packageName}" installed successfully`, {
          type: "connect-success",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        toast(`Failed to install "${packageName}": ${message}`, {
          type: "error",
        });
      }
    },
    [effectiveRegistryUrl, packageManager],
  );

  const handleUninstall = useCallback(
    async (packageId: string) => {
      const pkg = packagesInfo.find((p) => p.id === packageId);
      if (!pkg) {
        throw new Error(`Package with id ${packageId} not found`);
      }
      try {
        await packageManager?.removePackage(pkg.name);
        toast(`Package "${pkg.name}" uninstalled successfully`, {
          type: "connect-success",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        toast(`Failed to uninstall "${pkg.name}": ${message}`, {
          type: "error",
        });
      }
    },
    [packageManager, packagesInfo],
  );

  const handleInstallDismissed = useCallback(
    async (packageName: string) => {
      if (!effectiveRegistryUrl) {
        toast("No registry selected", { type: "error" });
        return;
      }
      try {
        await packageManager?.addPackage(packageName, effectiveRegistryUrl);
        packageManager?.removeDismissed(packageName);
        toast(`Package "${packageName}" installed successfully`, {
          type: "connect-success",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        toast(`Failed to install "${packageName}": ${message}`, {
          type: "error",
        });
      }
    },
    [effectiveRegistryUrl, packageManager],
  );

  return (
    <div className="flex h-full flex-1 flex-col">
      <PackageManager
        mutable={true}
        registries={registries}
        selectedRegistryId={selectedRegistryId}
        onRegistryChange={setSelectedRegistryId}
        registryStatus={registryStatus}
        customRegistryUrl={customRegistryUrl}
        onCustomRegistryUrlChange={setCustomRegistryUrl}
        packages={installedPackages}
        availablePackages={preInstalledPackages}
        onInstall={(name: string) => void handleInstall(name)}
        onUninstall={handleUninstall}
        fetchPackages={fetchPackages}
      />
      <DismissedPackagesList
        dismissedPackages={dismissedPackages}
        onInstall={handleInstallDismissed}
      />
    </div>
  );
};
