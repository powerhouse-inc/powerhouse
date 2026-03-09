import { PackageManager } from "@powerhousedao/design-system/connect";
import type { PackageDetails } from "@powerhousedao/design-system/connect";
import {
  makeVetraPackageManifest,
  useVetraPackageManager,
  useVetraPackages,
} from "@powerhousedao/reactor-browser";
import React, { useCallback, useMemo } from "react";
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
  const packageManager = useVetraPackageManager();
  const vetraPackages = useVetraPackages();
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
    (packageName: string) => {
      if (!effectiveRegistryUrl) {
        throw new Error("No registry selected");
      }
      return packageManager?.addPackage(packageName, effectiveRegistryUrl);
    },
    [effectiveRegistryUrl, packageManager],
  );

  const handleUninstall = useCallback(
    (packageId: string) => {
      const pkg = packagesInfo.find((p) => p.id === packageId);
      if (!pkg) {
        throw new Error(`Package with id ${packageId} not found`);
      }
      packageManager?.removePackage(pkg.name).catch(console.error);
    },
    [packageManager, packagesInfo],
  );

  return (
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
      onInstall={handleInstall}
      onUninstall={handleUninstall}
      fetchPackages={fetchPackages}
    />
  );
};
