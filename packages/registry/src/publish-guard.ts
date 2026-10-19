// Verdaccio's store writes a published version and its dist-tags into the
// packument before it uploads the tarball. When the upload fails the version
// stays listed without a tarball, and every retry is refused as "already
// present". The guard undoes what a failed publish left behind, and clears
// leftovers of publishes that never finished, so the publish can be retried.
import path from "node:path";
import { compareSemver } from "./semver.js";

export interface Packument {
  versions?: Record<string, unknown>;
  "dist-tags"?: Record<string, string>;
  time?: Record<string, string>;
  _attachments?: Record<string, unknown>;
  [key: string]: unknown;
}

/** The part of a Verdaccio storage plugin's package storage the guard uses */
export interface PackageFiles {
  readPackage(name: string): Promise<Packument>;
  updatePackage(
    name: string,
    update: (manifest: Packument) => Promise<Packument>,
  ): Promise<Packument>;
  savePackage(name: string, manifest: Packument): Promise<void>;
  hasTarball(fileName: string): Promise<boolean>;
  deletePackage(fileName: string): Promise<void>;
}

/** A Verdaccio storage plugin (local-storage, the S3 plugin) */
export interface PackageStore {
  getPackageStorage(name: string): PackageFiles | undefined;
}

export interface PublishTarget {
  name: string;
  version: string;
  /** The tarball's file name, as Verdaccio stores it */
  file: string;
}

/** What the storage held before a publish; null when nothing was stored */
export type PublishSnapshot = Packument | null;

// A version this long without its tarball belongs to a publish that died
// mid-way (a restart, a lost connection) rather than one still uploading
export const ABANDONED_AFTER_MS = 15 * 60_000;

/** The version and tarball a publish body carries, read as Verdaccio reads them. */
export function publishTarget(
  name: string,
  body: unknown,
): PublishTarget | null {
  if (body === null || typeof body !== "object") return null;
  const { versions, _attachments } = body as Packument;
  const version = Object.keys(versions ?? {}).at(0);
  const attachment = Object.keys(_attachments ?? {}).at(0);
  if (!version || !attachment) return null;
  return { name, version, file: path.basename(attachment) };
}

function isNotFound(err: unknown): boolean {
  const { code, status, statusCode } = (err ?? {}) as Record<string, unknown>;
  return (
    code === "ENOENT" || code === 404 || status === 404 || statusCode === 404
  );
}

async function readPackument(
  storage: PackageFiles,
  name: string,
): Promise<PublishSnapshot> {
  try {
    return await storage.readPackage(name);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/**
 * Removes `version` from the packument. Tags that pointed at it go back to
 * their values in `previousTags`, and are dropped if they had none; without
 * `previousTags` they move to the highest remaining version.
 */
export function dropVersion(
  manifest: Packument,
  version: string,
  previousTags?: Record<string, string>,
): Packument {
  const versions = manifest.versions ?? {};
  delete versions[version];
  delete manifest.time?.[version];
  const remaining = Object.keys(versions).sort(compareSemver);
  const tags = manifest["dist-tags"] ?? {};
  for (const [tag, tagged] of Object.entries(tags)) {
    if (tagged !== version) continue;
    const previous = previousTags ? previousTags[tag] : remaining.at(-1);
    const fallback =
      previous && previous !== version && previous in versions
        ? previous
        : undefined;
    if (fallback) tags[tag] = fallback;
    else delete tags[tag];
  }
  return manifest;
}

function abandoned(manifest: Packument, version: string, now: number): boolean {
  const published = Date.parse(manifest.time?.[version] ?? "");
  return Number.isNaN(published) || now - published > ABANDONED_AFTER_MS;
}

export class PublishGuard {
  readonly #store: PackageStore;
  readonly #now: () => number;

  constructor(store: PackageStore, now: () => number = Date.now) {
    this.#store = store;
    this.#now = now;
  }

  /**
   * Runs before Verdaccio sees a publish. Clears what earlier publishes of the
   * same version left behind, then returns the stored state the publish
   * starts from (undefined when it can't be read).
   */
  async prepare(target: PublishTarget): Promise<PublishSnapshot | undefined> {
    const storage = this.#store.getPackageStorage(target.name);
    if (!storage) return undefined;
    try {
      const stored = await readPackument(storage, target.name);
      if (!stored) return null;
      const { version, file } = target;
      const listed = stored.versions?.[version] !== undefined;
      const tarball = await storage.hasTarball(file);
      // Listed without a tarball by a publish that died, or a tarball and
      // attachment no listed version owns: both make a retry fail
      const orphanVersion =
        listed && !tarball && abandoned(stored, version, this.#now());
      const strayFiles =
        !listed && (tarball || stored._attachments?.[file] !== undefined);
      if (!orphanVersion && !strayFiles) return stored;
      console.warn(
        `[registry] clearing what an unfinished publish of ${target.name}@${version} left behind`,
      );
      return await this.#undo(storage, target, undefined);
    } catch (err) {
      console.error(
        `[registry] reading ${target.name} before a publish failed:`,
        err,
      );
      return undefined;
    }
  }

  /**
   * Runs when Verdaccio answered a publish with an error: removes the version,
   * tags and files the failed publish wrote, so a retry starts clean. True
   * when something was removed.
   */
  async rollback(
    target: PublishTarget,
    before: PublishSnapshot | undefined,
  ): Promise<boolean> {
    // Without the starting state there's no telling what this publish wrote
    if (before === undefined) return false;
    if (before?.versions?.[target.version] !== undefined) return false;
    const storage = this.#store.getPackageStorage(target.name);
    if (!storage) return false;
    try {
      const stored = await readPackument(storage, target.name);
      const listed = stored?.versions?.[target.version] !== undefined;
      const attached = stored?._attachments?.[target.file] !== undefined;
      if (!stored || (!listed && !attached)) return false;
      console.warn(
        `[registry] publish of ${target.name}@${target.version} failed; removing what it wrote`,
      );
      await this.#undo(storage, target, before?.["dist-tags"] ?? {});
      return true;
    } catch (err) {
      console.error(
        `[registry] rolling back the failed publish of ${target.name}@${target.version} failed:`,
        err,
      );
      return false;
    }
  }

  // Drops the version, its attachment and its tarball file under the storage's
  // package lock; tags move as dropVersion moves them
  async #undo(
    storage: PackageFiles,
    target: PublishTarget,
    previousTags: Record<string, string> | undefined,
  ): Promise<Packument> {
    const { name, version, file } = target;
    const updated = await storage.updatePackage(name, (manifest) => {
      dropVersion(manifest, version, previousTags);
      delete manifest._attachments?.[file];
      return Promise.resolve(manifest);
    });
    // local-storage leaves the write to its caller; the S3 plugin has written
    await storage.savePackage(name, updated);
    if (await storage.hasTarball(file)) await storage.deletePackage(file);
    return updated;
  }
}
