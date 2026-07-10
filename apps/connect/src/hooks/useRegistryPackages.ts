import {
  getPackagePage,
  getPackagesForDocumentType,
  trimTrailingSlash,
  useVetraPackageManager,
} from "@powerhousedao/reactor-browser";
import type {
  PackageInfo,
  PackageListItem,
  RegistryPackage,
  RegistryPackageList,
  RegistryPackageMap,
  RegistryPackageSource,
  RegistryPackageStatus,
} from "@powerhousedao/shared/registry";
import { slimManifest } from "@powerhousedao/shared/registry/manifest-slim";
import type { DocumentModelLib } from "document-model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRuntimeConfig } from "../runtime-config.js";

/** Page size for the paginated Available-packages listing. */
const AVAILABLE_PAGE_SIZE = 30;

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
  // Split for the two Package Manager tabs: installed is derivable from local
  // state alone (no network), available/dismissed come from the registry
  // fetch (or its localStorage cache).
  const installedPackages: RegistryPackageList = useMemo(
    () =>
      registryPackageList.filter(
        (p) => p.status === "local-install" || p.status === "registry-install",
      ),
    [registryPackageList],
  );
  // --- Available tab: paginated + server-searched, layered on the map ---
  //
  // The map above stays the single source of truth for each package's status,
  // version metadata and install state. `availableOrder` is the ordering layer
  // for the current search: a page-accumulated list of names. The rendered
  // available list looks each name up in the map and drops anything that is
  // now installed (it moves to the Installed tab) — so installing a row needs
  // no extra bookkeeping.
  const [availableOrder, setAvailableOrder] = useState<string[]>([]);
  const [availableTotal, setAvailableTotal] = useState<number | null>(null);
  const [availableHasMore, setAvailableHasMore] = useState(false);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);
  const [isLoadingMoreAvailable, setIsLoadingMoreAvailable] = useState(false);
  const [availableError, setAvailableError] = useState(false);

  // Latest search string (updated synchronously so a debounced fetch reads the
  // freshest query), the server offset for the next page, and a monotonic
  // request generation so out-of-order responses never clobber a newer query.
  const availableQueryRef = useRef("");
  const nextOffsetRef = useRef(0);
  const requestGenerationRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const availablePackages: RegistryPackageList = useMemo(
    () =>
      availableOrder
        .map((name) => registryPackagesMap[name])
        .filter(
          (p): p is RegistryPackage =>
            p !== undefined &&
            (p.status === "available" || p.status === "dismissed"),
        ),
    [availableOrder, registryPackagesMap],
  );

  const fetchAvailablePage = useCallback(
    async ({ reset }: { reset: boolean }): Promise<void> => {
      if (registryUrl === null || !packageManager) return;
      const generation = ++requestGenerationRef.current;
      const offset = reset ? 0 : nextOffsetRef.current;
      const search = availableQueryRef.current;
      if (reset) setIsLoadingAvailable(true);
      else setIsLoadingMoreAvailable(true);
      setAvailableError(false);

      try {
        const page = await getPackagePage(registryUrl, {
          limit: AVAILABLE_PAGE_SIZE,
          offset,
          search: search || undefined,
        });
        // A newer search/reset superseded this request — drop its result.
        if (generation !== requestGenerationRef.current) return;

        setRegistryPackagesMap((oldPackages) => {
          const next: RegistryPackageMap = { ...oldPackages };
          for (const item of page.items) {
            const existing = next[item.name];
            if (!existing) {
              const status = getPackageStatusFromPackageSource(
                packageManager.getPackageSource(item.name),
              );
              next[item.name] = makeRegistryPackageFromListItem(item, status);
            } else {
              // Keep the existing (possibly fuller) entry; just refresh the
              // installed version and re-promote status. Never downgrade an
              // installed/dismissed row from a trimmed list item.
              next[item.name] = {
                ...existing,
                version:
                  packageManager.getPackageVersion(item.name) ??
                  item.version ??
                  existing.version,
                status: promoteStatus(
                  existing.status,
                  packageManager.getPackageSource(item.name),
                ),
              };
            }
          }
          return next;
        });

        setAvailableOrder((prev) => {
          const base = reset ? [] : prev;
          const seen = new Set(base);
          const merged = [...base];
          for (const item of page.items) {
            if (!seen.has(item.name)) {
              seen.add(item.name);
              merged.push(item.name);
            }
          }
          return merged;
        });

        nextOffsetRef.current = offset + page.items.length;
        setAvailableTotal(page.total);
        setAvailableHasMore(page.hasMore);
      } catch (error: unknown) {
        if (generation !== requestGenerationRef.current) return;
        // Log the raw failure for debugging; the UI only gets a boolean so we
        // never surface generic API / network messages to the user.
        console.error(error);
        setAvailableError(true);
      } finally {
        // Only the newest request clears the spinners.
        if (generation === requestGenerationRef.current) {
          setIsLoadingAvailable(false);
          setIsLoadingMoreAvailable(false);
        }
      }
    },
    [registryUrl, packageManager, setRegistryPackagesMap],
  );

  /** Debounced server search — resets to page 1 for the new query. */
  const setAvailableSearch = useCallback(
    (query: string) => {
      availableQueryRef.current = query;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void fetchAvailablePage({ reset: true });
      }, 300);
    },
    [fetchAvailablePage],
  );

  /** Load the next page (infinite scroll). No-op when exhausted/busy. */
  const loadMoreAvailable = useCallback(() => {
    if (!availableHasMore || isLoadingAvailable || isLoadingMoreAvailable) {
      return;
    }
    void fetchAvailablePage({ reset: false });
  }, [
    availableHasMore,
    isLoadingAvailable,
    isLoadingMoreAvailable,
    fetchAvailablePage,
  ]);

  /**
   * Load page 1 the first time the Available tab is opened. Re-opening keeps
   * the accumulated pages; a fetch error leaves the panel's Retry to re-fetch
   * (this guard avoids auto-retry loops on tab re-open).
   */
  function ensureAvailableLoaded() {
    if (availableOrder.length > 0 || isLoadingAvailable || availableError) {
      return;
    }
    void fetchAvailablePage({ reset: true });
  }

  /**
   * Fetch full package info for a document type (via the legacy
   * `?documentType=` filter) and merge into the map. Lets MissingPackageModal
   * offer installs without loading the whole paginated listing.
   */
  const fetchPackagesByDocumentType = useCallback(
    async (documentType: string): Promise<RegistryPackage[]> => {
      if (registryUrl === null || !packageManager) return [];
      try {
        const infos = await getPackagesForDocumentType(
          registryUrl,
          documentType,
        );
        setRegistryPackagesMap((oldPackages) => {
          const next: RegistryPackageMap = { ...oldPackages };
          for (const info of infos) {
            const existing = next[info.name];
            const status = getPackageStatusFromPackageSource(
              packageManager.getPackageSource(info.name),
            );
            next[info.name] = existing
              ? {
                  ...existing,
                  status: promoteStatus(
                    existing.status,
                    packageManager.getPackageSource(info.name),
                  ),
                }
              : makeRegistryPackageFromPackageInfo(info, status);
          }
          return next;
        });
        return infos.map((info) =>
          makeRegistryPackageFromPackageInfo(
            info,
            getPackageStatusFromPackageSource(
              packageManager.getPackageSource(info.name),
            ),
          ),
        );
      } catch (error: unknown) {
        console.error(error);
        return [];
      }
    },
    [registryUrl, packageManager, setRegistryPackagesMap],
  );

  // Clear any pending debounce on unmount.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

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
    installedPackages,
    // Available tab (paginated + server search)
    availablePackages,
    availableTotal,
    availableHasMore,
    isLoadingAvailable,
    isLoadingMoreAvailable,
    availableError,
    ensureAvailableLoaded,
    fetchAvailablePage,
    loadMoreAvailable,
    setAvailableSearch,
    fetchPackagesByDocumentType,
    // Status mutations
    updateRegistryPackageStatus,
    registerFallbackRegistryPackage,
  };
}

/**
 * Build a RegistryPackage from a trimmed paginated list item. Version metadata
 * (distTags/versions) and documentTypes are absent — the row lazy-loads them.
 */
function makeRegistryPackageFromListItem(
  item: PackageListItem,
  status: RegistryPackageStatus,
): RegistryPackage {
  return {
    name: item.name,
    path: item.path,
    documentTypes: [],
    version: item.version,
    status,
    manifest: {
      name: item.name,
      ...(item.description !== undefined
        ? { description: item.description }
        : {}),
      ...(item.category !== undefined ? { category: item.category } : {}),
      ...(item.publisher !== undefined ? { publisher: item.publisher } : {}),
    },
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
