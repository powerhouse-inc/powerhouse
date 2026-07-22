import type { PackageInfo, PackagePage } from "@powerhousedao/shared/registry";

// Strip a trailing "/" so we don't emit `http://host//packages` when a user
// writes `packageRegistryUrl: "http://host/"`. Verdaccio's own web backend
// 404s on the doubled slash, which cascades into an empty registry list and
// masks the real install flow.
export function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export async function getPackages(registryUrl: string) {
  const res = await fetch(`${trimTrailingSlash(registryUrl)}/packages`);
  if (!res.ok) throw new Error(`Registry error: HTTP ${res.status}`);
  const data = (await res.json()) as PackageInfo[];
  return data;
}

/**
 * Fetch one page of the registry listing (trimmed items). Backed by the
 * paginated `GET /packages?limit=&offset=&search=` mode. Used by the Package
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
  const res = await fetch(
    `${trimTrailingSlash(registryUrl)}/packages?${query.toString()}`,
  );
  if (!res.ok) throw new Error(`Registry error: HTTP ${res.status}`);
  return (await res.json()) as PackagePage;
}

/**
 * Fetch full package info for every package exposing a given document type,
 * via the legacy `?documentType=` filter (returns full PackageInfo objects,
 * not just names). Used by the MissingPackageModal to offer installs without
 * loading the entire paginated listing.
 */
export async function getPackagesForDocumentType(
  registryUrl: string,
  documentType: string,
): Promise<PackageInfo[]> {
  const encodedType = encodeURIComponent(documentType);
  const res = await fetch(
    `${trimTrailingSlash(registryUrl)}/packages?documentType=${encodedType}`,
  );
  if (!res.ok) throw new Error(`Registry error: HTTP ${res.status}`);
  return (await res.json()) as PackageInfo[];
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
