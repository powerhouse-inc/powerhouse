import type { PackageInfo, PackagePage } from "@powerhousedao/shared/registry";

// Strip a trailing "/" so we don't emit `http://host//packages` when a user
// writes `packageRegistryUrl: "http://host/"`. Verdaccio's own web backend
// 404s on the doubled slash, which cascades into an empty registry list and
// masks the real install flow.
export function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

// The registry's largest page; the cap bounds a registry that never ends
const PAGE_SIZE = 50;
const MAX_PAGES = 200;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Registry error: HTTP ${res.status}`);
  return res.json();
}

// Every package matching `query`, in full detail, paged `PAGE_SIZE` at a time.
async function queryAllPackages(
  registryUrl: string,
  query: Record<string, string>,
): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];
  for (let n = 0; n < MAX_PAGES; n++) {
    const params = new URLSearchParams({
      ...query,
      detail: "full",
      limit: String(PAGE_SIZE),
      offset: String(packages.length),
    });
    const page = (await getJson(
      `${trimTrailingSlash(registryUrl)}/packages?${params.toString()}`,
    )) as PackagePage<PackageInfo>;
    packages.push(...page.items);
    if (!page.hasMore || page.items.length === 0) break;
  }
  return packages;
}

export async function getPackages(registryUrl: string) {
  return queryAllPackages(registryUrl, {});
}

// Packages whose name, description, publisher or module names match `search`.
export async function searchPackages(
  registryUrl: string,
  search: string,
): Promise<PackageInfo[]> {
  return queryAllPackages(registryUrl, { search });
}

/**
 * One page of the registry listing (trimmed items). Used by the Package
 * Manager's Available tab for infinite scroll + server-side search.
 */
export async function getPackagePage(
  registryUrl: string,
  params: { limit: number; offset: number; search?: string },
): Promise<PackagePage> {
  const query = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  });
  if (params.search) query.set("search", params.search);
  return (await getJson(
    `${trimTrailingSlash(registryUrl)}/packages?${query.toString()}`,
  )) as PackagePage;
}

/**
 * Full package info for every package exposing a given document type. Used by
 * the MissingPackageModal to offer installs without loading the whole listing.
 */
export async function getPackagesForDocumentType(
  registryUrl: string,
  documentType: string,
): Promise<PackageInfo[]> {
  return queryAllPackages(registryUrl, { documentType });
}

export async function getPackagesByDocumentType(
  registryUrl: string,
  documentType: string,
): Promise<string[]> {
  const encodedType = encodeURIComponent(documentType);
  const res = await fetch(
    `${trimTrailingSlash(registryUrl)}/packages/by-document-type?type=${encodedType}`,
  );
  if (!res.ok) throw new Error(`Registry error: HTTP ${res.status}`);
  return (await res.json()) as string[];
}

/**
 * Fetch full metadata (versions + dist-tags) for one package from the
 * single-package endpoint. Returns null when the package no longer exists
 * upstream.
 */
export async function getPackageInfo(
  registryUrl: string,
  name: string,
): Promise<PackageInfo | null> {
  const encodedName = encodeURIComponent(name);
  const res = await fetch(
    `${trimTrailingSlash(registryUrl)}/packages/${encodedName}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Registry error: HTTP ${res.status}`);
  return (await res.json()) as PackageInfo;
}
