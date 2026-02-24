import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { extract } from "tar";

export class CdnCache {
  constructor(
    private registryUrl: string,
    private cdnCachePath: string,
  ) {}

  async getFile(packageName: string, filePath: string): Promise<string | null> {
    const version = await this.getLatestVersion(packageName);
    if (!version) return null;

    const cached = path.join(this.cdnCachePath, packageName, version, filePath);
    if (!this.isSafePath(cached)) return null;

    if (!fs.existsSync(cached)) {
      await this.extractTarball(packageName, version);
    }

    if (!fs.existsSync(cached)) return null;
    return cached;
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
      return distTags?.latest ?? null;
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
