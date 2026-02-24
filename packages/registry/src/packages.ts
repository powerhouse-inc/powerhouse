import fs from "node:fs";
import path from "node:path";
import type { PackageInfo, PowerhouseManifest } from "./types.js";

function readManifest(dir: string): PowerhouseManifest | null {
  const manifestPath = path.join(dir, "powerhouse.manifest.json");
  try {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    return JSON.parse(raw) as PowerhouseManifest;
  } catch {
    return null;
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
  // Simple sort — latest semver-ish version last
  versions.sort();
  return path.join(pkgDir, versions[versions.length - 1]);
}

export function loadPackage(
  cdnCachePath: string,
  name: string,
): PackageInfo | null {
  const pkgDir = path.join(cdnCachePath, name);
  const versionDir = getLatestVersionDir(pkgDir);
  if (!versionDir) return null;

  const manifest = readManifest(versionDir);
  if (!manifest) return null;

  return {
    name: manifest.name ?? name,
    path: `/-/cdn/${name}`,
    manifest,
  };
}

export function scanPackages(cdnCachePath: string): PackageInfo[] {
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
      } catch {
        continue;
      }
      for (const scopedEntry of scopedEntries) {
        if (!scopedEntry.isDirectory()) continue;
        const dirName = `${entry.name}/${scopedEntry.name}`;
        const pkgDir = path.join(scopeDir, scopedEntry.name);
        const versionDir = getLatestVersionDir(pkgDir);
        if (!versionDir) continue;
        const manifest = readManifest(versionDir);
        if (!manifest) continue;
        const name = manifest.name ?? dirName;
        packages.push({
          name,
          path: `/-/cdn/${dirName}`,
          manifest,
        });
      }
    } else {
      const pkgDir = path.join(absDir, entry.name);
      const versionDir = getLatestVersionDir(pkgDir);
      if (!versionDir) continue;
      const manifest = readManifest(versionDir);
      if (!manifest) continue;
      const name = manifest.name ?? entry.name;
      packages.push({
        name,
        path: `/-/cdn/${entry.name}`,
        manifest,
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
