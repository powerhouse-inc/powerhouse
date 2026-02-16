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
    name,
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
        packages.push({
          name: `${entry.name}/${scopedEntry.name}`,
          path: `/${entry.name}/${scopedEntry.name}`,
          manifest: readManifest(pkgDir),
        });
      }
    } else {
      const pkgDir = path.join(absDir, entry.name);
      packages.push({
        name: entry.name,
        path: `/${entry.name}`,
        manifest: readManifest(pkgDir),
      });
    }
  }

  return packages;
}
