import type { PackageInfo } from "@powerhousedao/shared/registry";
export async function getPackages(registryUrl: string) {
  const res = await fetch(`${registryUrl}/packages`);
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
    `${registryUrl}/packages/by-document-type?type=${encodedType}`,
  );
  if (!res.ok) throw new Error(`Registry error: HTTP ${res.status}`);
  return (await res.json()) as string[];
}
