import type { PackageInfo } from "@powerhousedao/shared/registry";

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
