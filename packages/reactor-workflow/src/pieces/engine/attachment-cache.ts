// Content-addressed copies of downloaded attachments. A ref names its bytes,
// so a cached file never goes stale; steps get a clone, never the cache file.
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export interface CachedAttachmentMeta {
  fileName?: string;
  contentType?: string;
  size: number;
}

export interface AttachmentCacheOptions {
  dir: string;
  // Total bytes kept; the least recently used entries go first.
  maxBytes: number;
}

const META = ".json";

export class AttachmentCache {
  constructor(private readonly options: AttachmentCacheOptions) {}

  private entry(ref: string): string {
    // attachment://v1:<sha256> -> v1-<sha256>; anything else is not cacheable.
    const match = /^attachment:\/\/(v\d+):([a-f0-9]{64})$/i.exec(ref);
    if (!match) throw new Error(`Not a content-addressed reference: ${ref}`);
    return path.join(this.options.dir, `${match[1]}-${match[2].toLowerCase()}`);
  }

  static cacheable(ref: string): boolean {
    return /^attachment:\/\/v\d+:[a-f0-9]{64}$/i.test(ref);
  }

  // Copies a cached ref to destPath, or returns undefined on a miss.
  async get(
    ref: string,
    destPath: string,
  ): Promise<CachedAttachmentMeta | undefined> {
    const file = this.entry(ref);
    let meta: CachedAttachmentMeta;
    try {
      meta = JSON.parse(
        await readFile(file + META, "utf8"),
      ) as CachedAttachmentMeta;
      // A file whose size no longer matches was tampered with or torn.
      if ((await stat(file)).size !== meta.size) {
        await this.remove(file);
        return undefined;
      }
    } catch {
      return undefined;
    }
    // A clone where the filesystem has one: a piece writing to its copy never
    // reaches the cache.
    await copyFile(file, destPath, constants.COPYFILE_FICLONE);
    const now = new Date();
    await utimes(file, now, now).catch(() => undefined);
    return meta;
  }

  // Adopts a file just downloaded to srcPath, leaving srcPath in place.
  async put(
    ref: string,
    srcPath: string,
    meta: Omit<CachedAttachmentMeta, "size">,
  ): Promise<void> {
    if (this.options.maxBytes <= 0) return;
    const file = this.entry(ref);
    const size = (await stat(srcPath)).size;
    if (size > this.options.maxBytes) return;
    await mkdir(this.options.dir, { recursive: true });
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
      await copyFile(srcPath, tmp, constants.COPYFILE_FICLONE);
      await writeFile(file + META, JSON.stringify({ ...meta, size }));
      // Rename last: a reader never sees a file without its metadata.
      await rename(tmp, file);
    } catch (error) {
      await rm(tmp, { force: true });
      throw error;
    }
    await this.evict();
  }

  private async remove(file: string): Promise<void> {
    await rm(file, { force: true });
    await rm(file + META, { force: true });
  }

  private async evict(): Promise<void> {
    const names = await readdir(this.options.dir).catch(() => [] as string[]);
    const entries = await Promise.all(
      names
        .filter((name) => !name.endsWith(META) && !name.endsWith(".tmp"))
        .map(async (name) => {
          const file = path.join(this.options.dir, name);
          const info = await stat(file).catch(() => undefined);
          return info
            ? { file, size: info.size, used: info.mtimeMs }
            : undefined;
        }),
    );
    const live = entries
      .filter((e) => e !== undefined)
      .sort((a, b) => b.used - a.used);
    let total = 0;
    for (const entry of live) {
      total += entry.size;
      if (total > this.options.maxBytes) await this.remove(entry.file);
    }
  }
}
