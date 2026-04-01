import {
  getPackages,
  useVetraPackageManager,
} from "@powerhousedao/reactor-browser";
import type {
  PackageInfo,
  RegistryPackage,
  RegistryPackageList,
  RegistryPackageMap,
  RegistryPackageSource,
  RegistryPackageStatus,
} from "@powerhousedao/shared/registry";
import type { DocumentModelLib } from "document-model";
import { useEffect, useMemo } from "react";
import { useLocalStorage } from "usehooks-ts";

const REGISTRY_PACKAGES_KEY =
  `REGISTRY_PACKAGES:${PH_PACKAGE_REGISTRY_URL}` as const;

export function useRegistryPackages() {
  const packageManager = useVetraPackageManager();
  const packageManagerPackages = packageManager?.packages;
  const [registryPackagesMap, setRegistryPackagesMap] =
    useLocalStorage<RegistryPackageMap>(REGISTRY_PACKAGES_KEY, {});
  const registryPackageList: RegistryPackageList = useMemo(() => {
    return Array.from(Object.values(registryPackagesMap)).filter(
      (p) => p !== undefined,
    );
  }, [registryPackagesMap]);

  useEffect(() => {
    async function refreshPackages() {
      if (PH_PACKAGE_REGISTRY_URL === null || !packageManager) return;

      const packageInfos = await getPackages(PH_PACKAGE_REGISTRY_URL);

      setRegistryPackagesMap((oldPackages) => {
        const newRegistryPackages: RegistryPackageMap = {
          ...oldPackages,
        };

        for (const packageInfo of packageInfos) {
          const existingPackage = newRegistryPackages[packageInfo.name];

          if (!existingPackage) {
            const packageSource = packageManager.getPackageSource(
              packageInfo.name,
            );
            const status = getPackageStatusFromPackageSource(packageSource);
            newRegistryPackages[packageInfo.name] =
              makeRegistryPackageFromPackageInfo(packageInfo, status);
          }
        }

        return newRegistryPackages;
      });
    }

    refreshPackages().catch(console.error);
  }, []);

  useEffect(() => {
    if (!packageManager) return;

    if (packageManagerPackages?.length) {
      for (const packageManagerPackage of packageManagerPackages) {
        setRegistryPackagesMap((existingRegistryPackages) => {
          const existingPackage =
            existingRegistryPackages[packageManagerPackage.manifest.name];
          const newRegistryPackages = { ...existingRegistryPackages };
          if (existingPackage) {
            newRegistryPackages[packageManagerPackage.manifest.name] = {
              ...existingPackage,
            };
          } else {
            const packageSource = packageManager.getPackageSource(
              packageManagerPackage.manifest.name,
            );
            const status = getPackageStatusFromPackageSource(packageSource);
            const newRegistryPackage = makeRegistryPackageFromDocumentModelLib(
              packageManagerPackage,
              status,
            );
            newRegistryPackages[packageManagerPackage.manifest.name] =
              newRegistryPackage;
          }
          return newRegistryPackages;
        });
      }
    }
  }, [packageManagerPackages]);

  function updateRegistryPackageStatus(
    packageName: string,
    newStatus: RegistryPackageStatus,
  ) {
    setRegistryPackagesMap((oldRegistryPackages) => {
      const newRegistryPackages = { ...oldRegistryPackages };
      const newRegistryPackage = newRegistryPackages[packageName];
      if (!newRegistryPackage) {
        console.error(
          "Attempting to update status for package that does not exist.",
        );
        return newRegistryPackages;
      }
      newRegistryPackages[packageName] = {
        ...newRegistryPackage,
        status: newStatus,
      };

      return newRegistryPackages;
    });
  }

  return {
    registryPackagesMap,
    registryPackageList,
    updateRegistryPackageStatus,
  };
}

function makeRegistryPackageFromDocumentModelLib(
  documentModelLib: DocumentModelLib,
  status: RegistryPackageStatus,
): RegistryPackage {
  return {
    name: documentModelLib.manifest.name,
    path: "stub-path",
    documentTypes: documentModelLib.documentModels.map(
      (d) => d.documentModel.global.id,
    ),
    status,
    manifest: documentModelLib.manifest,
  };
}

function makeRegistryPackageFromPackageInfo(
  packageInfo: PackageInfo,
  status: RegistryPackageStatus,
): RegistryPackage {
  return {
    ...packageInfo,
    documentTypes: packageInfo.manifest?.documentModels?.map((d) => d.id) ?? [],
    status,
  };
}

function getPackageStatusFromPackageSource(
  packageSource: RegistryPackageSource | null,
): RegistryPackageStatus {
  // if we check the package source for a package that came from the api and it doesn't exist yet,
  // then we know the package is available on the api but not installed
  if (packageSource === null) return "available";
  // show common package, local project package and locally installed packages as "local-install"
  if (
    packageSource === "local-install" ||
    packageSource === "common" ||
    packageSource === "project"
  )
    return "local-install";
  // show "registry-install" status for package source "registry-install"
  if (packageSource === "registry-install") return "registry-install";
  // fallback to available — we should probably do more checks here
  return "available";
}
