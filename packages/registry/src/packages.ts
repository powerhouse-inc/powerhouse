import type { Manifest } from "@powerhousedao/shared";
import fs from "node:fs";
import path from "node:path";
import { compareSemver } from "./semver.js";
import type { PackageInfo } from "./types.js";

/**
 * Read dist-tags, the full version list, and the local-publish flag for a
 * package from verdaccio's on-disk storage (`{storagePath}/{name}/package.json`).
 *
 * `locallyPublished` is tri-state:
 *   - `true`  → storage metadata has `_attachments` (tarball uploaded here).
 *   - `false` → storage metadata exists but `_attachments` is empty (proxy
 *               from the npm uplink only; no local publish at this registry).
 *   - `undefined` → metadata file wasn't readable. Happens with non-filesystem
 *               backends (S3, etc.) or if verdaccio stores metadata elsewhere.
 *               Callers should treat this as "unknown" and default to including
 *               the package, to avoid filtering the whole /packages list to an
 *               empty array on deployments where we can't observe _attachments.
 */
function readPackageMetadata(
  storagePath: string | undefined,
  packageName: string,
): {
  distTags?: Record<string, string>;
  versions?: string[];
  locallyPublished: boolean | undefined;
} {
  if (!storagePath) return { locallyPublished: undefined };
  try {
    const metadataPath = path.join(storagePath, packageName, "package.json");
    const raw = fs.readFileSync(metadataPath, "utf-8");
    const parsed = JSON.parse(raw) as {
      "dist-tags"?: Record<string, string>;
      versions?: Record<string, unknown>;
      _attachments?: Record<string, unknown>;
    };
    const distTags = parsed["dist-tags"];
    const rawVersions = parsed.versions ? Object.keys(parsed.versions) : [];
    const versions = rawVersions.slice().sort(compareSemver);
    const locallyPublished =
      !!parsed._attachments && Object.keys(parsed._attachments).length > 0;
    return {
      distTags:
        distTags && Object.keys(distTags).length > 0 ? distTags : undefined,
      versions: versions.length > 0 ? versions : undefined,
      locallyPublished,
    };
  } catch {
    return { locallyPublished: undefined };
  }
}

/**
 * Locally-published check for a package, from verdaccio storage metadata.
 * Returns the same tri-state as `readPackageMetadata.locallyPublished`:
 * `true` (has `_attachments`), `false` (proxy-only), `undefined` (unreadable).
 */
export function isLocallyPublished(
  storagePath: string | undefined,
  packageName: string,
): boolean | undefined {
  return readPackageMetadata(storagePath, packageName).locallyPublished;
}

function readManifest(dir: string): Manifest | null {
  const candidates = [
    path.join(dir, "powerhouse.manifest.json"),
    path.join(dir, "cdn", "powerhouse.manifest.json"),
    path.join(dir, "dist", "powerhouse.manifest.json"),
  ];
  for (const manifestPath of candidates) {
    try {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      return JSON.parse(raw) as Manifest;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function readPackageJsonVersion(dir: string): string | undefined {
  try {
    const raw = fs.readFileSync(path.join(dir, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

function getLatestVersionDir(pkgDir: string): string | null {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(pkgDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const versions = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  if (versions.length === 0) return null;
  versions.sort(compareSemver);
  return path.join(pkgDir, versions[versions.length - 1]);
}

export function loadPackage(
  cdnCachePath: string,
  name: string,
  version?: string,
): PackageInfo | null {
  const pkgDir = path.join(cdnCachePath, name);
  const versionDir = version
    ? path.join(pkgDir, version)
    : getLatestVersionDir(pkgDir);
  const manifestDir = versionDir ?? pkgDir;
  const manifest = readManifest(manifestDir);

  if (!manifest) {
    return null;
  }
  return {
    name: manifest.name ?? name,
    path: `/-/cdn/${name}`,
    manifest,
    documentTypes: getDocumentTypesFromManifest(manifest),
    version: readPackageJsonVersion(manifestDir),
  };
}

function getDocumentTypesFromManifest(manifest: Manifest | undefined | null) {
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

export function scanPackages(
  cdnCachePath: string,
  storagePath?: string,
): PackageInfo[] {
  const absDir = path.resolve(cdnCachePath);
  const packages: PackageInfo[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return packages;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    if (entry.name.startsWith("@")) {
      const scopeDir = path.join(absDir, entry.name);
      let scopedEntries: fs.Dirent[];
      try {
        scopedEntries = fs.readdirSync(scopeDir, { withFileTypes: true });
      } catch (error) {
        console.log(error);
        continue;
      }
      for (const scopedEntry of scopedEntries) {
        if (!scopedEntry.isDirectory()) continue;
        const dirName = `${entry.name}/${scopedEntry.name}`;
        const pkgDir = path.join(scopeDir, scopedEntry.name);
        const versionDir = getLatestVersionDir(pkgDir);
        const manifestDir = versionDir ?? pkgDir;
        const manifest = readManifest(manifestDir);
        const name = manifest?.name ?? dirName;
        const { distTags, versions, locallyPublished } = readPackageMetadata(
          storagePath,
          name,
        );
        // Drop npm-uplink passthroughs from the default listing. Only
        // skip when we can affirmatively tell the package is a proxy
        // (no `_attachments` in filesystem-backed storage). When the flag
        // is `undefined` (no storagePath, or non-filesystem backend where
        // we can't read verdaccio's metadata) we include the entry — the
        // alternative would be filtering everything to `[]` on S3 deploys.
        if (locallyPublished === false) continue;
        packages.push({
          name,
          path: `/-/cdn/${dirName}`,
          manifest,
          documentTypes: getDocumentTypesFromManifest(manifest),
          version: readPackageJsonVersion(manifestDir),
          distTags,
          versions,
        });
      }
    } else {
      const pkgDir = path.join(absDir, entry.name);
      const versionDir = getLatestVersionDir(pkgDir);
      const manifestDir = versionDir ?? pkgDir;
      const manifest = readManifest(manifestDir);
      const name = manifest?.name ?? entry.name;
      const { distTags, versions, locallyPublished } = readPackageMetadata(
        storagePath,
        name,
      );
      if (locallyPublished === false) continue;
      packages.push({
        name,
        path: `/-/cdn/${entry.name}`,
        manifest,
        documentTypes: getDocumentTypesFromManifest(manifest),
        version: readPackageJsonVersion(manifestDir),
        distTags,
        versions,
      });
    }
  }

  return packages;
}

export function findPackagesByDocumentType(
  packagesDir: string,
  documentType: string,
): PackageInfo[] {
  const allPackages = scanPackages(packagesDir);

  return allPackages.filter((pkg) => {
    if (!pkg.manifest?.documentModels) {
      return false;
    }
    return pkg.manifest.documentModels.some((dm) => dm.id === documentType);
  });
}
