import type { Manifest } from "@powerhousedao/shared";
import { slimManifest } from "@powerhousedao/shared/registry";
import type { PackageListItem } from "@powerhousedao/shared/registry";
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
  storagePath?: string,
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
  const resolvedName = manifest.name || name;
  // Include dist-tags/versions so the paginated UI can lazy-load version
  // metadata for a single package (the list DTO omits them). Falls back to
  // undefined when storage metadata isn't available.
  const { distTags, versions } = readPackageMetadata(storagePath, resolvedName);
  return {
    name: resolvedName,
    path: `/-/cdn/${name}`,
    manifest,
    documentTypes: getDocumentTypesFromManifest(manifest),
    version: readPackageJsonVersion(manifestDir),
    distTags,
    versions,
  };
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

/** One cdn-cache package directory, as the scan below found it. */
export interface ScannedPackage {
  /** Directory under the cdn cache: `name` or `@scope/name`. */
  dirName: string;
  /** Absolute directory the manifest was read from (the version dir, if any). */
  manifestDir: string;
  manifest: Manifest | null;
  name: string;
  version?: string;
  distTags?: Record<string, string>;
  versions?: string[];
  locallyPublished: boolean | undefined;
}

function readPackageDir(
  cdnCachePath: string,
  dirName: string,
  storagePath: string | undefined,
): ScannedPackage {
  const pkgDir = path.join(cdnCachePath, dirName);
  const versionDir = getLatestVersionDir(pkgDir);
  const manifestDir = versionDir ?? pkgDir;
  const manifest = readManifest(manifestDir);
  // `||` (not `??`): slimManifest normalizes a missing manifest name to
  // "" — fall back to the directory name in that case too.
  const name = manifest?.name || dirName;
  const { distTags, versions, locallyPublished } = readPackageMetadata(
    storagePath,
    name,
  );
  return {
    dirName,
    manifestDir,
    manifest,
    name,
    version: readPackageJsonVersion(manifestDir),
    distTags,
    versions,
    locallyPublished,
  };
}

// One walk of the cdn cache, yielding every package directory with its
// manifest: the package list and the piece index are both built from it.
export function* scanPackageDirs(
  cdnCachePath: string,
  storagePath?: string,
): Generator<ScannedPackage> {
  const absDir = path.resolve(cdnCachePath);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    if (!entry.name.startsWith("@")) {
      yield readPackageDir(absDir, entry.name, storagePath);
      continue;
    }
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
      yield readPackageDir(
        absDir,
        `${entry.name}/${scopedEntry.name}`,
        storagePath,
      );
    }
  }
}

export function scanPackages(
  cdnCachePath: string,
  storagePath?: string,
): PackageInfo[] {
  const packages: PackageInfo[] = [];
  for (const pkg of scanPackageDirs(cdnCachePath, storagePath)) {
    // Drop npm-uplink passthroughs, but only when storage metadata says so:
    // `undefined` (S3, no storagePath) would otherwise empty the listing.
    if (pkg.locallyPublished === false) continue;
    packages.push({
      name: pkg.name,
      path: `/-/cdn/${pkg.dirName}`,
      manifest: pkg.manifest,
      documentTypes: getDocumentTypesFromManifest(pkg.manifest),
      version: pkg.version,
      distTags: pkg.distTags,
      versions: pkg.versions,
    });
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
