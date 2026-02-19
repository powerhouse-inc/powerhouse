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

export function loadPackage(
  packagesDir: string,
  name: string,
): PackageInfo | null {
  const absDir = path.resolve(packagesDir);
  const pkgDir = path.join(absDir, name);
  const manifest = readManifest(pkgDir);
  if (!manifest) {
    return null;
  }
  return {
    // Use manifest.name as authoritative source, fallback to provided name
    name: manifest.name ?? name,
    path: `/${name}`,
    manifest,
  };
}

export function scanPackages(packagesDir: string): PackageInfo[] {
  const absDir = path.resolve(packagesDir);
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
      // Scoped package directory — scan one level deeper
      const scopeDir = path.join(absDir, entry.name);
      let scopedEntries: fs.Dirent[];
      try {
        scopedEntries = fs.readdirSync(scopeDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const scopedEntry of scopedEntries) {
        if (!scopedEntry.isDirectory()) continue;
        const pkgDir = path.join(scopeDir, scopedEntry.name);
        const manifest = readManifest(pkgDir);
        // Use manifest.name as authoritative source, fallback to directory path
        const dirName = `${entry.name}/${scopedEntry.name}`;
        const name = manifest?.name ?? dirName;
        packages.push({
          name,
          path: `/${dirName}`,
          manifest,
        });
      }
    } else {
      const pkgDir = path.join(absDir, entry.name);
      const manifest = readManifest(pkgDir);
      // Use manifest.name as authoritative source, fallback to directory name
      const name = manifest?.name ?? entry.name;
      packages.push({
        name,
        path: `/${entry.name}`,
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
