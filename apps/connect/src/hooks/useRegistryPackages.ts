import {
  getPackages,
  trimTrailingSlash,
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
import { slimManifest } from "@powerhousedao/shared/registry/manifest-slim";
import type { DocumentModelLib } from "document-model";
import { useEffect, useMemo, useState } from "react";
import { getRuntimeConfig } from "../runtime-config.js";

export function useRegistryPackages() {
  const packageManager = useVetraPackageManager();
  const packageManagerPackages = packageManager?.packages;
  const registryUrl = getRuntimeConfig().packageRegistryUrl ?? null;
  // Normalize so `http://host` and `http://host/` don't produce two separate
  // localStorage maps where the install/status flow reads from one while the
  // registry fetch writes to the other.
  const registryPackagesKey = `REGISTRY_PACKAGES:${registryUrl === null ? null : trimTrailingSlash(registryUrl)}`;
  const [registryPackagesMap, setRegistryPackagesMap] =
    useBestEffortLocalStorage<RegistryPackageMap>(registryPackagesKey, {});
  const registryPackageList: RegistryPackageList = useMemo(() => {
    return Array.from(Object.values(registryPackagesMap)).filter(
      (p) => p !== undefined,
    );
  }, [registryPackagesMap]);

  useEffect(() => {
    async function refreshPackages() {
      if (registryUrl === null || !packageManager) return;

      const packageInfos = await getPackages(registryUrl);

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
            // registry sent. This includes distTags and the versions list
            // the Package Manager UI filters on.
            //
            // For `version`, prefer the actually-installed version from the
            // package manager (set by the rehydration effect). `packageInfo.version`
            // is the registry's newest-published version, which for installed
            // packages would incorrectly overwrite the user's picked version
            // on the next /packages refresh.
            const installedVersion = packageManager.getPackageVersion(
              packageInfo.name,
            );
            newRegistryPackages[packageInfo.name] = {
              ...existingPackage,
              manifest:
                slimManifest(packageInfo.manifest) ?? existingPackage.manifest,
              version:
                installedVersion ??
                packageInfo.version ??
                existingPackage.version,
              distTags: packageInfo.distTags ?? existingPackage.distTags,
              versions: packageInfo.versions ?? existingPackage.versions,
              documentTypes: packageInfo.documentTypes.length
                ? packageInfo.documentTypes
                : existingPackage.documentTypes,
              status: promoteStatus(
                existingPackage.status,
                packageManager.getPackageSource(packageInfo.name),
              ),
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
              status: promoteStatus(
                existingPackage.status,
                packageManager.getPackageSource(packageName),
              ),
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
    manifest: slimManifest(documentModelLib.manifest),
    version,
  };
}

function makeRegistryPackageFromPackageInfo(
  packageInfo: PackageInfo,
  status: RegistryPackageStatus,
): RegistryPackage {
  return {
    ...packageInfo,
    // Slim before caching: registry manifests are unvalidated JSON and have
    // carried multi-megabyte junk fields that blew the localStorage quota
    // (and the UI only reads the summary fields anyway).
    manifest: slimManifest(packageInfo.manifest),
    documentTypes: packageInfo.manifest?.documentModels?.map((d) => d.id) ?? [],
    status,
  };
}

/**
 * Like usehooks-ts' useLocalStorage, but persistence is best-effort: a failed
 * `setItem` (e.g. QuotaExceededError on an oversized payload) keeps the
 * in-memory state so the package manager still works for the session.
 * useLocalStorage couples the state update to the write — when the write
 * threw, the freshly fetched package list was discarded and the registry UI
 * rendered (and searched) an empty list.
 *
 * The key is derived from the boot-time runtime config and never changes
 * within a session, so no key-change rehydration is needed.
 */
function useBestEffortLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(
    () => readJsonFromStorage<T>(key) ?? initialValue,
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Free the key and retry once — a stale oversized entry from an older
      // session may be occupying the quota this write needs.
      try {
        window.localStorage.removeItem(key);
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        console.warn(
          `Failed to persist "${key}" to localStorage; continuing with in-memory data.`,
          error,
        );
      }
    }
  }, [key, value]);

  return [value, setValue] as const;
}

function readJsonFromStorage<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

/**
 * When refreshing a cached entry, promote `"available"` to whatever the
 * packageManager now reports — the cached `"available"` was almost certainly
 * recorded before `packageManager.addPackages()` finished on a prior session.
 * Never downgrade an already-installed entry, and never overwrite a deliberate
 * `"dismissed"` choice.
 */
function promoteStatus(
  cachedStatus: RegistryPackageStatus,
  packageSource: RegistryPackageSource | null,
): RegistryPackageStatus {
  if (cachedStatus !== "available") return cachedStatus;
  if (packageSource === null) return cachedStatus;
  return getPackageStatusFromPackageSource(packageSource);
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
