// Documents stamped 0 or unversioned are version 1, as the registry assigns;
// resolving 0 to "latest" would re-pin a legacy document to the newest module.
export function normalizeDocumentModelVersion(
  version: number | undefined | null,
): number {
  return version && version > 0 ? version : 1;
}
