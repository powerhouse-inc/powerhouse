import { childLogger, type ILogger } from "document-model";
import { init as lexerInit, parse as lexImports } from "es-module-lexer";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { findPackageJSON, isBuiltin } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Entry files a registry package's node build is served from, CDN-relative. */
export const PACKAGE_ENTRIES = {
  documentModels: "node/document-models/index.mjs",
  subgraphs: "node/subgraphs/index.mjs",
  processors: "node/processors/index.mjs",
} as const;

export type PackageEntryKind = keyof typeof PACKAGE_ENTRIES;

// Error code for a registry package that ships none of the asked-for entry.
export const REGISTRY_ENTRY_ABSENT = "ERR_REGISTRY_ENTRY_ABSENT";

export const MANIFEST_FILE = "manifest.json";

export function defaultRegistryCacheDir(cwd = process.cwd()): string {
  return path.join(cwd, ".ph", "registry-packages");
}

// A published package.json version: never a range or a dist-tag.
export const EXACT_VERSION =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const PACKAGE_NAME = /^(@[a-z0-9][-a-z0-9._]*\/)?[a-z0-9][-a-z0-9._]*$/i;

export function isValidPackageName(name: string): boolean {
  return PACKAGE_NAME.test(name) && !name.includes("..") && name.length <= 214;
}

// Generous next to the few hundred KB a document-models graph weighs.
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const MAX_FILES = 2_000;
const MAX_IN_FLIGHT = 4;
const FETCH_TIMEOUT_MS = 30_000;
// Leftovers younger than this are left alone even when their pid looks dead.
const DEAD_PID_GRACE_MS = 60_000;
const ABANDONED_AFTER_MS = 60 * 60_000;
const LEFTOVER = /\.(?:tmp|stale)-(\d+)-[0-9a-f]{8}$/;

// es-module-lexer import kinds: static (incl. `export … from`) and dynamic.
const STATIC_IMPORT = 1;
const DYNAMIC_IMPORT = 2;

export type RegistryCacheManifest = {
  name: string;
  version: string;
  /** Entries the package serves, CDN-relative; absent ones are left out. */
  entries: Partial<Record<PackageEntryKind, string>>;
  /** CDN-relative path -> sha256 hex. */
  files: Record<string, string>;
  /** Bare specifiers the graph imports. */
  bareImports: string[];
};

export type CachedRegistryPackage = {
  name: string;
  version: string;
  dir: string;
  /** Absolute entry files inside `dir`, for the entries the package serves. */
  entries: Partial<Record<PackageEntryKind, string>>;
  source: "cache" | "download";
};

export type RegistryPackageCacheOptions = {
  registryUrl: string;
  cacheDir?: string;
  logger?: ILogger;
  fetchTimeoutMs?: number;
};

type Dependency =
  | { kind: "bare"; specifier: string }
  | { kind: "file"; rel: string };

// On-disk copy of a registry package's node module graphs, so its modules
// import from file paths that worker threads can load too.
export class RegistryPackageCache {
  readonly cacheDir: string;
  private readonly registryUrl: string;
  private readonly logger: ILogger;
  private readonly fetchTimeoutMs: number;
  private readonly inFlight = new Map<string, Promise<CachedRegistryPackage>>();
  // Verified once per process; later calls skip re-hashing.
  private readonly verified = new Map<string, CachedRegistryPackage>();

  constructor(options: RegistryPackageCacheOptions) {
    this.registryUrl = options.registryUrl.endsWith("/")
      ? options.registryUrl
      : `${options.registryUrl}/`;
    this.cacheDir = path.resolve(options.cacheDir ?? defaultRegistryCacheDir());
    this.logger =
      options.logger ?? childLogger(["reactor-api", "registry-cache"]);
    this.fetchTimeoutMs = options.fetchTimeoutMs ?? FETCH_TIMEOUT_MS;
  }

  /** Base URL every file of `name@version` is fetched under. */
  baseUrl(name: string, version: string): string {
    return `${this.registryUrl}-/cdn/${name}@${version}/`;
  }

  entryDir(name: string, version: string): string {
    assertCoordinate(name, version);
    const dir = path.join(this.cacheDir, `${name}@${version}`);
    assertWithin(dir, this.cacheDir);
    return dir;
  }

  /** Complete cached versions of `name`, newest-agnostic. */
  async cachedVersions(name: string): Promise<string[]> {
    if (!isValidPackageName(name)) return [];
    const parent = path.dirname(path.join(this.cacheDir, `${name}@0.0.0`));
    const leaf = path.basename(name);
    let names: string[];
    try {
      names = await readdir(parent);
    } catch {
      return [];
    }
    const versions: string[] = [];
    for (const entry of names) {
      if (!entry.startsWith(`${leaf}@`)) continue;
      const version = entry.slice(leaf.length + 1);
      if (!EXACT_VERSION.test(version)) continue;
      try {
        await stat(path.join(parent, entry, MANIFEST_FILE));
        versions.push(version);
      } catch {
        // incomplete
      }
    }
    return versions;
  }

  async ensurePackage(
    name: string,
    version: string,
  ): Promise<CachedRegistryPackage> {
    const dir = this.entryDir(name, version);
    const done = this.verified.get(dir);
    if (done) return { ...done, source: "cache" };
    const pending = this.inFlight.get(dir);
    if (pending) return pending;
    const started = this.resolveEntry(name, version, dir).finally(() =>
      this.inFlight.delete(dir),
    );
    this.inFlight.set(dir, started);
    return started;
  }

  private async resolveEntry(
    name: string,
    version: string,
    dir: string,
  ): Promise<CachedRegistryPackage> {
    let manifest = await this.verify(dir, name, version);
    let source: CachedRegistryPackage["source"] = "cache";
    if (!manifest) {
      manifest = await this.fill(name, version, dir);
      source = "download";
    }
    await this.linkBareImports(manifest.bareImports);
    const entries: Partial<Record<PackageEntryKind, string>> = {};
    for (const [kind, rel] of Object.entries(manifest.entries)) {
      entries[kind as PackageEntryKind] = path.join(dir, rel);
    }
    const result: CachedRegistryPackage = {
      name,
      version,
      dir,
      entries,
      source,
    };
    this.verified.set(dir, result);
    return result;
  }

  /** The manifest when every listed file is present and hashes to it. */
  private async verify(
    dir: string,
    name: string,
    version: string,
  ): Promise<RegistryCacheManifest | null> {
    let manifest: RegistryCacheManifest;
    try {
      manifest = parseManifest(
        await readFile(path.join(dir, MANIFEST_FILE), "utf8"),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      this.logger.warn("Unreadable cache manifest in @dir: @error", dir, error);
      await this.discard(dir);
      return null;
    }
    if (
      manifest.name !== name ||
      manifest.version !== version ||
      Object.values(manifest.entries).some((rel) => !(rel in manifest.files))
    ) {
      this.logger.warn("Cache manifest in @dir names another package", dir);
      await this.discard(dir);
      return null;
    }
    for (const [rel, expected] of Object.entries(manifest.files)) {
      let actual: string | null;
      try {
        const file = path.join(dir, rel);
        assertWithin(file, dir);
        actual = sha256(await readFile(file));
      } catch {
        actual = null;
      }
      if (actual !== expected) {
        this.logger.warn(
          "Cached @file of @package failed verification; fetching it again",
          rel,
          `${name}@${version}`,
        );
        await this.discard(dir);
        return null;
      }
    }
    return manifest;
  }

  // Moved aside first so a reader never sees a half-deleted entry.
  private async discard(dir: string): Promise<void> {
    const aside = `${dir}.stale-${process.pid}-${randomUUID().slice(0, 8)}`;
    try {
      await rename(dir, aside);
    } catch {
      return;
    }
    await rm(aside, { recursive: true, force: true });
  }

  private async fill(
    name: string,
    version: string,
    dir: string,
  ): Promise<RegistryCacheManifest> {
    const staging = `${dir}.tmp-${process.pid}-${randomUUID().slice(0, 8)}`;
    assertWithin(staging, this.cacheDir);
    await sweepLeftovers(path.dirname(dir));
    await mkdir(staging, { recursive: true });
    try {
      const manifest = await this.download(name, version, staging);
      // Written last: its presence marks a complete entry.
      await writeFile(
        path.join(staging, MANIFEST_FILE),
        JSON.stringify(manifest, null, 2),
      );
      await chmod(staging, 0o755);
      try {
        await rename(staging, dir);
      } catch {
        // Another process won the rename; its copy is accepted if it verifies.
        const theirs = await this.verify(dir, name, version);
        if (theirs) return theirs;
        // Not a finished entry, so debris: replace it.
        await this.discard(dir);
        await rename(staging, dir);
      }
      return manifest;
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  private async download(
    name: string,
    version: string,
    staging: string,
  ): Promise<RegistryCacheManifest> {
    await lexerInit;
    const base = this.baseUrl(name, version);
    const files: Record<string, string> = {};
    const bare = new Set<string>();
    const entryRels = new Set<string>(Object.values(PACKAGE_ENTRIES));
    const queue: string[] = [...entryRels];
    const seen = new Set<string>(queue);
    let totalBytes = 0;

    const processOne = async (rel: string): Promise<void> => {
      const url = new URL(rel, base).href;
      // A package need not ship every entry; only a missing entry is optional.
      const body = await this.fetchBounded(url, entryRels.has(rel));
      if (!body) return;
      totalBytes += body.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error(
          `${name}@${version} exceeds the ${MAX_TOTAL_BYTES}-byte cache cap`,
        );
      }
      const target = path.join(staging, rel);
      assertWithin(target, staging);
      for (const dep of this.dependenciesOf(body.toString("utf8"), url, base)) {
        if (dep.kind === "bare") {
          bare.add(dep.specifier);
          continue;
        }
        if (seen.has(dep.rel)) continue;
        if (seen.size >= MAX_FILES) {
          throw new Error(
            `${name}@${version} imports more than ${MAX_FILES} files`,
          );
        }
        seen.add(dep.rel);
        queue.push(dep.rel);
      }
      files[rel] = sha256(body);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
    };

    // Bounded pool: at most MAX_IN_FLIGHT files fetched at once.
    const active = new Set<Promise<void>>();
    let failure: Error | undefined;
    while ((queue.length > 0 || active.size > 0) && failure === undefined) {
      while (queue.length > 0 && active.size < MAX_IN_FLIGHT) {
        const rel = queue.shift()!;
        const task: Promise<void> = processOne(rel).then(
          () => {
            active.delete(task);
          },
          (error: unknown) => {
            active.delete(task);
            failure ??=
              error instanceof Error ? error : new Error(String(error));
          },
        );
        active.add(task);
      }
      if (active.size > 0) await Promise.race(active);
    }
    if (failure !== undefined) {
      await Promise.allSettled(active);
      throw failure;
    }

    const entries: Partial<Record<PackageEntryKind, string>> = {};
    for (const [kind, rel] of Object.entries(PACKAGE_ENTRIES)) {
      if (rel in files) entries[kind as PackageEntryKind] = rel;
    }
    if (Object.keys(entries).length === 0) {
      throw new Error(
        `${name}@${version} serves no document models, subgraphs or processors`,
      );
    }
    return {
      name,
      version,
      entries,
      files: Object.fromEntries(
        Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
      ),
      bareImports: [...bare].sort(),
    };
  }

  private dependenciesOf(
    source: string,
    url: string,
    base: string,
  ): Dependency[] {
    const [imports] = lexImports(source, url);
    const deps: Dependency[] = [];
    for (const imp of imports) {
      const kind = imp.t as number;
      if (kind !== STATIC_IMPORT && kind !== DYNAMIC_IMPORT) continue;
      const specifier = imp.n;
      if (specifier === undefined) {
        if (kind === DYNAMIC_IMPORT) {
          this.logger.warn(
            "Non-literal dynamic import in @url is not cached: @expr",
            url,
            source.slice(imp.s, imp.e),
          );
        }
        continue;
      }
      if (isBuiltin(specifier)) continue;
      if (
        specifier.startsWith("./") ||
        specifier.startsWith("../") ||
        specifier.startsWith("/") ||
        /^https?:\/\//i.test(specifier)
      ) {
        deps.push({ kind: "file", rel: relativeTo(base, specifier, url) });
        continue;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(specifier)) {
        throw new Error(`${url} imports an unsupported URL: ${specifier}`);
      }
      deps.push({ kind: "bare", specifier });
    }
    return deps;
  }

  private async fetchBounded(
    url: string,
    optional = false,
  ): Promise<Buffer | null> {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.fetchTimeoutMs),
    });
    if (optional && response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`${url} responded ${response.status}`);
    }
    const declared = response.headers.get("content-length");
    if (declared && Number(declared) > MAX_FILE_BYTES) {
      await response.body?.cancel();
      throw new Error(`${url} exceeds the ${MAX_FILE_BYTES}-byte file cap`);
    }
    if (!response.body) return Buffer.from(await response.arrayBuffer());
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FILE_BYTES) {
        await reader.cancel();
        throw new Error(`${url} exceeds the ${MAX_FILE_BYTES}-byte file cap`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }

  // Bare imports only reactor-api's tree provides are linked under
  // <cacheDir>/node_modules, which hosts and workers both walk up to.
  private async linkBareImports(specifiers: string[]): Promise<void> {
    // Where a cached file resolves past the link root: `<cwd>/node_modules` up.
    const outsideUrl = pathToFileURL(
      path.join(path.dirname(this.cacheDir), "/"),
    ).href;
    const linkRoot = path.join(this.cacheDir, "node_modules");
    for (const specifier of specifiers) {
      const pkg = packageNameOf(specifier);
      if (!pkg || !isValidPackageName(pkg)) continue;
      const link = path.join(linkRoot, pkg);
      assertWithin(link, linkRoot);
      if (packageRoot(specifier, pkg, outsideUrl)) {
        // The project provides it; a link would shadow that copy.
        await removeLink(link);
        continue;
      }
      const fallback = packageRoot(specifier, pkg, import.meta.url);
      if (!fallback) {
        this.logger.warn(
          "Registry package import @specifier resolves from neither the project nor reactor-api",
          specifier,
        );
        continue;
      }
      try {
        await ensureLink(link, await realpath(fallback));
      } catch (error) {
        this.logger.warn(
          "Could not link @pkg for cached registry packages: @error",
          pkg,
          error,
        );
      }
    }
  }
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function assertCoordinate(name: string, version: string): void {
  if (!isValidPackageName(name)) {
    throw new Error(`Invalid registry package name: ${name}`);
  }
  if (!EXACT_VERSION.test(version)) {
    throw new Error(`Invalid registry package version: ${version}`);
  }
}

export function assertWithin(target: string, root: string): void {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(target);
  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error(`Path escapes the registry cache: ${target}`);
  }
}

// CDN-relative path of `specifier` imported from `fromUrl`, refused outside `base`.
function relativeTo(base: string, specifier: string, fromUrl: string): string {
  const resolved = new URL(specifier, fromUrl);
  resolved.search = "";
  resolved.hash = "";
  if (!resolved.href.startsWith(base)) {
    throw new Error(
      `${fromUrl} imports ${specifier}, which is outside the package`,
    );
  }
  const rel = decodeURIComponent(resolved.href.slice(base.length));
  if (
    rel === "" ||
    rel === MANIFEST_FILE ||
    rel.includes("\\") ||
    rel.includes("\0") ||
    rel.split("/").some((s) => s === "" || s === "." || s === "..")
  ) {
    throw new Error(`${fromUrl} imports an unusable path: ${specifier}`);
  }
  return rel;
}

function parseManifest(raw: string): RegistryCacheManifest {
  const value = JSON.parse(raw) as Record<string, unknown>;
  if (
    typeof value.name !== "string" ||
    typeof value.version !== "string" ||
    typeof value.entries !== "object" ||
    value.entries === null ||
    typeof value.files !== "object" ||
    value.files === null ||
    !Array.isArray(value.bareImports)
  ) {
    throw new Error("malformed manifest");
  }
  return value as unknown as RegistryCacheManifest;
}

function packageNameOf(specifier: string): string | null {
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  }
  return parts[0] || null;
}

// Root dir of the package `specifier` resolves to from `base`, or null.
function packageRoot(
  specifier: string,
  pkg: string,
  base: string,
): string | null {
  let found: string | undefined;
  try {
    found = findPackageJSON(specifier, base);
  } catch {
    return null;
  }
  if (!found) return null;
  // A subpath can land on a nested package.json; climb to the named one.
  let dir = path.dirname(found);
  for (let i = 0; i < 16; i++) {
    if (dir.endsWith(`${path.sep}node_modules${path.sep}${pkg}`)) return dir;
    if (readPackageName(path.join(dir, "package.json")) === pkg) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readPackageName(file: string): string | undefined {
  try {
    return (JSON.parse(readFileSync(file, "utf8")) as { name?: string }).name;
  } catch {
    return undefined;
  }
}

// Removes staging and discarded dirs that dead or long-gone processes left.
async function sweepLeftovers(parent: string): Promise<void> {
  let names: string[];
  try {
    names = await readdir(parent);
  } catch {
    return;
  }
  const now = Date.now();
  for (const name of names) {
    const match = LEFTOVER.exec(name);
    if (!match) continue;
    const pid = Number(match[1]);
    if (pid === process.pid) continue;
    const full = path.join(parent, name);
    let age: number;
    try {
      age = now - (await lstat(full)).mtimeMs;
    } catch {
      continue;
    }
    const abandoned =
      age > ABANDONED_AFTER_MS || (age > DEAD_PID_GRACE_MS && !isAlive(pid));
    if (abandoned) await rm(full, { recursive: true, force: true });
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: alive, owned by someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function ensureLink(link: string, target: string): Promise<void> {
  try {
    if ((await readlink(link)) === target) return;
  } catch {
    // missing, or not a link
  }
  await mkdir(path.dirname(link), { recursive: true });
  await sweepLeftovers(path.dirname(link));
  // Swapped in by rename so a concurrent resolver never sees no link.
  const temp = `${link}.tmp-${process.pid}-${randomUUID().slice(0, 8)}`;
  await symlink(target, temp, "junction");
  try {
    await rename(temp, link);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

async function removeLink(link: string): Promise<void> {
  try {
    await readlink(link);
  } catch {
    return;
  }
  await rm(link, { force: true });
}
