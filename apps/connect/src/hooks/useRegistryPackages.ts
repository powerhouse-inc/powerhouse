import {
  getPackages,
  useVetraPackageManager,
  type VetraPackage,
} from "@powerhousedao/reactor-browser";
import type {
  PackageInfo,
  RegistryPackage,
  RegistryPackageList,
  RegistryPackageMap,
  RegistryPackageStatus,
} from "@powerhousedao/shared/registry";
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
      if (PH_PACKAGE_REGISTRY_URL === null) return;

      const packageInfos = await getPackages(PH_PACKAGE_REGISTRY_URL);

      setRegistryPackagesMap((oldPackages) => {
        const newRegistryPackages =
          makeRegistryPackagesFromPackageInfo(packageInfos);

        for (const oldRegistryPackage of Object.values(oldPackages).filter(
          (p) => p !== undefined,
        )) {
          const packageToUpdate = newRegistryPackages[oldRegistryPackage.name];

          if (packageToUpdate) {
            newRegistryPackages[packageToUpdate.name] = {
              ...packageToUpdate,
              status: oldRegistryPackage.status,
            };
          }
        }

        return newRegistryPackages;
      });
    }

    refreshPackages().catch(console.error);
  }, []);

  useEffect(() => {
    if (packageManagerPackages?.length) {
      for (const packageManagerPackage of packageManagerPackages) {
        setRegistryPackagesMap((existingRegistryPackages) => {
          const existingPackage =
            existingRegistryPackages[packageManagerPackage.name];
          const newRegistryPackages = { ...existingRegistryPackages };
          if (existingPackage) {
            newRegistryPackages[packageManagerPackage.name] = {
              ...existingPackage,
              status: "installed",
            };
          } else {
            const newRegistryPackage = makeRegistryPackageFromVetraPackage(
              packageManagerPackage,
              "installed",
            );
            newRegistryPackages[packageManagerPackage.name] =
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

function makeRegistryPackageFromVetraPackage(
  vetraPackage: VetraPackage,
  status: RegistryPackageStatus = "available",
): RegistryPackage {
  return {
    name: vetraPackage.name,
    path: "stub-path",
    documentTypes:
      vetraPackage.modules.documentModelModules?.map((d) => d.id) ?? [],
    status,
    manifest: {
      name: vetraPackage.name,
      category: vetraPackage.category,
      description: vetraPackage.description,
      publisher: {
        name: vetraPackage.author.name,
        url: vetraPackage.author.website ?? "",
      },
      ...vetraPackage.modules,
    },
  };
}

function makeRegistryPackageFromPackageInfo(
  packageInfo: PackageInfo,
): RegistryPackage {
  return {
    ...packageInfo,
    documentTypes: packageInfo.manifest?.documentModels?.map((d) => d.id) ?? [],
    status: "available" as const,
  };
}

function makeRegistryPackagesFromPackageInfo(
  packageInfos: PackageInfo[],
): RegistryPackageMap {
  const registryPackages: Record<string, RegistryPackage> = {};
  for (const packageInfo of packageInfos) {
    const registryPackage = makeRegistryPackageFromPackageInfo(packageInfo);
    registryPackages[packageInfo.name] = registryPackage;
  }
  return registryPackages;
}
