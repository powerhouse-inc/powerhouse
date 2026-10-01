import type { Manifest } from "@powerhousedao/shared";
import { slimManifest } from "@powerhousedao/shared/registry";
import type { PackageListItem } from "@powerhousedao/shared/registry";
import fs from "node:fs";
import path from "node:path";
import type { PackageInfo } from "./types.js";

export function readManifest(dir: string): Manifest | null {
  const candidates = [
    path.join(dir, "powerhouse.manifest.json"),
    path.join(dir, "cdn", "powerhouse.manifest.json"),
    path.join(dir, "dist", "powerhouse.manifest.json"),
  ];
  for (const manifestPath of candidates) {
    try {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      // Manifests are publisher-supplied JSON; slim to the known summary
      // fields so one oversized publish can't bloat every /packages
      // listing (a single 7.8 MB `features` blob once pushed the response
      // past clients' localStorage quota). The raw file stays available
      // through the CDN path.
      return slimManifest(JSON.parse(raw) as Manifest);
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Project a full {@link PackageInfo} down to the trimmed shape the paginated
 * package-listing UI renders per row. Version metadata and documentTypes are
 * intentionally dropped — the client fetches them on demand.
 */
export function toPackageListItem(pkg: PackageInfo): PackageListItem {
  const publisher = pkg.manifest?.publisher;
  return {
    name: pkg.name,
    path: pkg.path,
    version: pkg.version,
    description: pkg.manifest?.description ?? undefined,
    category: pkg.manifest?.category ?? undefined,
    publisher: publisher
      ? { name: publisher.name, url: publisher.url }
      : undefined,
  };
}

export function getDocumentTypesFromManifest(
  manifest: Manifest | undefined | null,
) {
  if (!manifest) return [];

  const documentTypes: string[] = [];
  const { apps, documentModels, editors, subgraphs } = manifest;

  if (apps?.length) {
    documentTypes.push("powerhouse/document-drive");
  }
  documentTypes.push(
    ...(documentModels ?? []).map((dm) => dm.id),
    ...(editors ?? [])
      .flatMap((e) => e.documentTypes)
      .filter((dt) => dt !== undefined),
    ...(subgraphs ?? [])
      .flatMap((e) => e.documentTypes)
      .filter((dt) => dt !== undefined),
  );

  return documentTypes;
}
