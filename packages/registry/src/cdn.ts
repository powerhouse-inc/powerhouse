import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { extract } from "tar";

export class CdnCache {
  #extractionLocks = new Map<string, Promise<void>>();

  constructor(
    private registryUrl: string,
    private cdnCachePath: string,
  ) {}

  async getFile(packageName: string, filePath: string): Promise<string | null> {
    // Try local CDN cache first (pre-populated or previously extracted)
    const version =
      this.getLatestCachedVersion(packageName) ??
      (await this.getLatestVersion(packageName));
    if (!version) return null;

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

  private getLatestCachedVersion(packageName: string): string | null {
    const pkgDir = path.join(this.cdnCachePath, packageName);
    try {
      const entries = fs.readdirSync(pkgDir, { withFileTypes: true });
      const versions = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
      if (versions.length === 0) return null;
      versions.sort();
      return versions[versions.length - 1];
    } catch {
      return null;
    }
  }

  async getLatestVersion(packageName: string): Promise<string | null> {
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
      if (!distTags) return null;
      // Prefer "latest" tag, fall back to any available tag
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

    const tmpFile = path.join(destDir, ".tmp-tarball.tgz");
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

  private isSafePath(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    const cacheRoot = path.resolve(this.cdnCachePath);
    return resolved.startsWith(cacheRoot + path.sep) || resolved === cacheRoot;
  }
}
