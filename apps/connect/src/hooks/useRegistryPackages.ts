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

// Normalize the registry URL before using it as the localStorage key.
// Otherwise `http://host` and `http://host/` produce two separate maps and
// the install/status flow reads from one while the registry fetch writes to
// the other.
const REGISTRY_PACKAGES_KEY = `REGISTRY_PACKAGES:${
  typeof PH_PACKAGE_REGISTRY_URL === "string" &&
  PH_PACKAGE_REGISTRY_URL.endsWith("/")
    ? PH_PACKAGE_REGISTRY_URL.slice(0, -1)
    : PH_PACKAGE_REGISTRY_URL
}` as const;

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
          } else {
            // Keep the cached entry's status, but refresh anything the
            // registry sent. This includes version, distTags, and the
            // versions list the Package Manager UI filters on.
            newRegistryPackages[packageInfo.name] = {
              ...existingPackage,
              manifest: packageInfo.manifest ?? existingPackage.manifest,
              version: packageInfo.version ?? existingPackage.version,
              distTags: packageInfo.distTags ?? existingPackage.distTags,
              versions: packageInfo.versions ?? existingPackage.versions,
              documentTypes: packageInfo.documentTypes.length
                ? packageInfo.documentTypes
                : existingPackage.documentTypes,
            };
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
          const packageName = packageManagerPackage.manifest.name;
          const existingPackage = existingRegistryPackages[packageName];
          const newRegistryPackages = { ...existingRegistryPackages };
          const version = packageManager.getPackageVersion(packageName);
          if (existingPackage) {
            newRegistryPackages[packageName] = {
              ...existingPackage,
              version: version ?? existingPackage.version,
            };
          } else {
            const packageSource = packageManager.getPackageSource(packageName);
            const status = getPackageStatusFromPackageSource(packageSource);
            const newRegistryPackage = makeRegistryPackageFromDocumentModelLib(
              packageManagerPackage,
              status,
              version,
            );
            newRegistryPackages[packageName] = newRegistryPackage;
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

  /**
   * Register a freshly-installed package that came in via the npm-uplink
   * fallback — the user typed a bare name, our local `/packages` didn't know
   * it, but the install succeeded because verdaccio proxy-fetched the tarball.
   *
   * This is the one legitimate case where the status update runs against a
   * name that wasn't in the registry map. We treat it as an insert rather
   * than logging the "does not exist" error. Data is pulled from the loaded
   * module so the UI card shows the real manifest immediately; the next
   * `/packages` refresh will add `versions`/`distTags`.
   */
  function registerFallbackRegistryPackage(
    packageName: string,
    loadedPackage: DocumentModelLib,
    version: string | undefined,
    status: RegistryPackageStatus,
  ) {
    setRegistryPackagesMap((oldRegistryPackages) => {
      const newRegistryPackages = { ...oldRegistryPackages };
      newRegistryPackages[packageName] = {
        ...makeRegistryPackageFromDocumentModelLib(
          loadedPackage,
          status,
          version,
        ),
        name: packageName,
      };
      return newRegistryPackages;
    });
  }

  return {
    registryPackagesMap,
    registryPackageList,
    updateRegistryPackageStatus,
    registerFallbackRegistryPackage,
  };
}

function makeRegistryPackageFromDocumentModelLib(
  documentModelLib: DocumentModelLib,
  status: RegistryPackageStatus,
  version?: string,
): RegistryPackage {
  return {
    name: documentModelLib.manifest.name,
    path: "stub-path",
    documentTypes: documentModelLib.documentModels.map(
      (d) => d.documentModel.global.id,
    ),
    status,
    manifest: documentModelLib.manifest,
    version,
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
