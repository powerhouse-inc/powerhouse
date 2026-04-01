import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { extract } from "tar";
import { compareSemver } from "./semver.js";

/**
 * Parse a package specifier into name and version/tag.
 * Supports:
 *   "@scope/pkg"           -> { name: "@scope/pkg", tag: undefined }
 *   "@scope/pkg@dev"       -> { name: "@scope/pkg", tag: "dev" }
 *   "@scope/pkg@1.0.0"     -> { name: "@scope/pkg", tag: "1.0.0" }
 *   "pkg@latest"           -> { name: "pkg", tag: "latest" }
 */
export function parsePackageSpec(spec: string): {
  name: string;
  tag: string | undefined;
} {
  // For scoped packages (@scope/name@tag), split on the last @
  // For unscoped packages (name@tag), split on the first @
  if (spec.startsWith("@")) {
    // Scoped: find the @ after the scope/name portion
    const lastAt = spec.lastIndexOf("@");
    if (lastAt > 0 && lastAt !== spec.indexOf("@")) {
      return { name: spec.slice(0, lastAt), tag: spec.slice(lastAt + 1) };
    }
    return { name: spec, tag: undefined };
  }
  const atIndex = spec.indexOf("@");
  if (atIndex > 0) {
    return { name: spec.slice(0, atIndex), tag: spec.slice(atIndex + 1) };
  }
  return { name: spec, tag: undefined };
}

export class CdnCache {
  #extractionLocks = new Map<string, Promise<void>>();

  constructor(
    private registryUrl: string,
    private cdnCachePath: string,
  ) {}

  async getFileByVersion(
    packageName: string,
    version: string,
    filePath: string,
  ): Promise<string | null> {
    const versionDir = path.join(this.cdnCachePath, packageName, version);

    // Check all possible paths before attempting extraction
    const resolved = this.#resolveFile(versionDir, filePath);
    if (resolved) return resolved;

    // File not found in any location — extract tarball and try again
    await this.#extractWithLock(packageName, version);

    return this.#resolveFile(versionDir, filePath);
  }

  #resolveFile(versionDir: string, filePath: string): string | null {
    // Check direct path first, then fall back to cdn/ and dist/cdn/ subdirectories
    // (npm tarballs contain files under dist/, bun bundles go to cdn/)
    const candidates = [
      path.join(versionDir, filePath),
      path.join(versionDir, "cdn", filePath),
      path.join(versionDir, "dist", "cdn", filePath),
      path.join(versionDir, "dist", filePath),
    ];

    for (const candidate of candidates) {
      if (this.isSafePath(candidate) && fs.existsSync(candidate))
        return candidate;
    }

    return null;
  }

  async #extractWithLock(packageName: string, version: string): Promise<void> {
    const key = `${packageName}@${version}`;
    const existing = this.#extractionLocks.get(key);
    if (existing) return existing;

    const promise = this.extractTarball(packageName, version).finally(() => {
      this.#extractionLocks.delete(key);
    });
    this.#extractionLocks.set(key, promise);
    return promise;
  }

  getLatestCachedVersion(packageName: string): string | null {
    const pkgDir = path.join(this.cdnCachePath, packageName);
    try {
      const entries = fs.readdirSync(pkgDir, { withFileTypes: true });
      const versions = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
      if (versions.length === 0) return null;
      versions.sort(compareSemver);
      return versions[versions.length - 1];
    } catch {
      return null;
    }
  }

  /**
   * Resolve a version for a package. If tag is a semver version that exists
   * in the registry, return it directly. If tag is a dist-tag name (e.g.
   * "dev", "latest"), resolve it to the concrete version. If no tag is
   * provided, prefer "latest", then fall back to any available dist-tag.
   */
  async resolveVersion(
    packageName: string,
    tag?: string,
  ): Promise<string | null> {
    try {
      const url = `${this.registryUrl}/${encodeURIComponent(packageName)}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const metadata = (await res.json()) as Record<string, unknown>;
      const distTags = metadata["dist-tags"] as
        | Record<string, string>
        | undefined;
      const versions = metadata["versions"] as
        | Record<string, unknown>
        | undefined;

      if (tag) {
        // If the tag matches an exact version in the registry, use it directly
        if (versions && tag in versions) return tag;
        // Otherwise treat it as a dist-tag name
        if (distTags && tag in distTags) return distTags[tag];
        // Tag not found
        return null;
      }

      if (!distTags) return null;
      // No tag specified: prefer "latest", fall back to any available tag
      return distTags.latest ?? Object.values(distTags)[0] ?? null;
    } catch {
      return null;
    }
  }

  async extractTarball(packageName: string, version: string): Promise<void> {
    const shortName = packageName.startsWith("@")
      ? packageName.split("/")[1]
      : packageName;
    const tarballUrl = `${this.registryUrl}/${encodeURIComponent(packageName)}/-/${shortName}-${version}.tgz`;

    let res: Response;
    try {
      res = await fetch(tarballUrl);
      if (!res.ok || !res.body) return;
    } catch {
      return;
    }

    const destDir = path.join(this.cdnCachePath, packageName, version);
    fs.mkdirSync(destDir, { recursive: true });

    const tmpFile = path.join(
      destDir,
      `.tmp-tarball-${crypto.randomUUID()}.tgz`,
    );
    try {
      const fileStream = fs.createWriteStream(tmpFile);
      await pipeline(Readable.fromWeb(res.body as never), fileStream);
      await extract({ file: tmpFile, cwd: destDir, strip: 1 });
    } finally {
      fs.rmSync(tmpFile, { force: true });
    }
  }

  invalidate(packageName: string): void {
    const cacheDir = path.join(this.cdnCachePath, packageName);
    if (!this.isSafePath(cacheDir)) return;
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }

  /** Remove all cached version directories except the specified one. */
  pruneOldVersions(packageName: string, keepVersion: string): void {
    const pkgDir = path.join(this.cdnCachePath, packageName);
    try {
      const entries = fs.readdirSync(pkgDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== keepVersion) {
          const dir = path.join(pkgDir, entry.name);
          if (this.isSafePath(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
          }
        }
      }
    } catch {
      // ignore — directory may not exist yet
    }
  }

  private isSafePath(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    const cacheRoot = path.resolve(this.cdnCachePath);
    return resolved.startsWith(cacheRoot + path.sep) || resolved === cacheRoot;
  }
}
