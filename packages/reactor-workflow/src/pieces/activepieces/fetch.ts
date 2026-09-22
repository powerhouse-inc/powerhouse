import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip as gunzipCb } from "node:zlib";
import { pieceRegistrySource } from "./registry-source.js";

const gunzip = promisify(gunzipCb);

// Mirrors their pieceBundle.resolve(): CDN bundle when served, else the npm
// tarball. Tarballs are immutable per (name, version), so the cache never expires.
const CDN_PIECES_URL = "https://cdn.activepieces.com/pieces/bundled/";
const NPM_REGISTRY_URL = "https://registry.npmjs.org";

export function cdnTarballUrl(name: string, version: string): string {
  return `${CDN_PIECES_URL}${name.replace("/", "-")}-${version}.tgz`;
}

export function npmTarballUrl(name: string, version: string): string {
  const unscoped = name.startsWith("@") ? name.split("/")[1] : name;
  return `${NPM_REGISTRY_URL}/${name}/-/${unscoped}-${version}.tgz`;
}

// name/version come from a workflow step's blockType, an unconstrained string.
const NPM_NAME_RE = /^(@[a-z0-9][a-z0-9-_.]*\/)?[a-z0-9][a-z0-9-_.]*$/;
const NPM_VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9.+-]*$/;

function assertValidPackageCoordinate(name: string, version: string): void {
  if (!NPM_NAME_RE.test(name)) {
    throw new Error(`Invalid piece package name: ${name}`);
  }
  if (!NPM_VERSION_RE.test(version)) {
    throw new Error(`Invalid piece package version: ${version}`);
  }
}

// Belt-and-suspenders: the path we're about to rm/rename must land under cacheDir.
function assertWithinCacheDir(dir: string, cacheDir: string): void {
  const root = path.resolve(cacheDir);
  const resolved = path.resolve(dir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Resolved piece cache path escapes cacheDir: ${dir}`);
  }
}

function readString(header: Buffer, offset: number, length: number): string {
  const slice = header.subarray(offset, offset + length);
  const nul = slice.indexOf(0);
  return slice.subarray(0, nul === -1 ? length : nul).toString("utf8");
}

// Published piece bundles run a few hundred KB extracted; the cap is well clear
// of that and bounds what a hostile or corrupt tarball can inflate to.
const MAX_EXTRACTED_BYTES = 64 * 1024 * 1024;

// Caps the compressed transfer itself, before gunzip ever runs — the decompressed
// cap above does nothing for a huge (not necessarily bomb-like) response body.
const MAX_COMPRESSED_BYTES = 64 * 1024 * 1024;

// Minimal ustar extraction: regular files only, "package/" root stripped.
async function extractTarball(tgz: Buffer, dest: string): Promise<void> {
  // Async gunzip: the sync one blocks the reactor's event loop for every
  // request, not just this one, and inflation is unbounded without maxOutputLength.
  const tar = await gunzip(tgz, { maxOutputLength: MAX_EXTRACTED_BYTES }).catch(
    (error: unknown) => {
      throw new Error(`Failed to decompress piece bundle: ${String(error)}`);
    },
  );
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const size = parseInt(readString(header, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(header[156]);
    offset += 512;
    const isFile = type === "0" || type === "\0" || type === "";
    if (isFile && size >= 0) {
      const full = prefix ? `${prefix}/${name}` : name;
      const rel = full.replace(/^[^/]+\//, "");
      const target = path.resolve(dest, rel);
      // Guard against path traversal from a hostile tarball.
      if (rel && target.startsWith(path.resolve(dest) + path.sep)) {
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, tar.subarray(offset, offset + size));
      }
    }
    offset += Math.ceil(size / 512) * 512;
  }
}

export interface FetchPieceBundleOptions {
  name: string;
  version: string;
  cacheDir: string;
  timeoutMs?: number;
  // How long the install of a bundle's declared dependencies may run, for the
  // few that declare any. Bounds a hung registry rather than budgeting work.
  installTimeoutMs?: number;
}

/** Where a bundle came from, "cache" being a copy one of the others left. */
export type BundleSource = "registry" | "cdn" | "npm";

export interface FetchedBundle {
  dir: string;
  source: BundleSource | "cache";
  // What the bundle's own manifest declares. Empty for 739 of the 760
  // published pieces, which is the path that costs nothing.
  dependencies: Record<string, string>;
  // Whether those declarations were installed beside it, rather than the
  // bundle being loaded straight out of its extraction.
  installed: boolean;
}

// Bounds the transfer before gunzip: rejects an over-limit Content-Length up
// front, else tracks a running total as the body streams in.
async function readBoundedBody(
  response: Response,
  url: string,
): Promise<Buffer> {
  const declared = response.headers.get("content-length");
  if (declared && Number(declared) > MAX_COMPRESSED_BYTES) {
    throw new Error(
      `${url} exceeds the ${MAX_COMPRESSED_BYTES}-byte compressed size cap (Content-Length: ${declared})`,
    );
  }
  if (!response.body) return Buffer.from(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_COMPRESSED_BYTES) {
      await reader.cancel();
      throw new Error(
        `${url} exceeds the ${MAX_COMPRESSED_BYTES}-byte compressed size cap`,
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// A Powerhouse registry this deployment allowed comes first, so a piece it
// serves is not shadowed by an Activepieces piece of the same name.
function tarballSources(
  name: string,
  version: string,
): { source: BundleSource; url: string }[] {
  const registry = pieceRegistrySource();
  return [
    ...(registry
      ? [
          {
            source: "registry" as const,
            url: registry.tarballUrl(name, version),
          },
        ]
      : []),
    { source: "cdn" as const, url: cdnTarballUrl(name, version) },
    { source: "npm" as const, url: npmTarballUrl(name, version) },
  ];
}

async function downloadTarball(
  name: string,
  version: string,
  timeoutMs: number,
): Promise<{ tgz: Buffer; source: BundleSource }> {
  const sources = tarballSources(name, version);
  let lastError: unknown;
  for (const { source, url } of sources) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        lastError = new Error(`${url} responded ${response.status}`);
        continue;
      }
      return { tgz: await readBoundedBody(response, url), source };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Failed to fetch piece bundle ${name}@${version}: ${String(lastError)}`,
  );
}

// Downloads and extracts a published piece bundle, returning the directory to
// hand to loadPieceFromDir(). A cached extraction is reused, and re-checked.
export async function fetchPieceBundle(
  options: FetchPieceBundleOptions,
): Promise<FetchedBundle> {
  const { name, version, cacheDir, timeoutMs = 30_000 } = options;
  assertValidPackageCoordinate(name, version);
  const dir = path.join(cacheDir, `${name.replace("/", "-")}-${version}`);
  assertWithinCacheDir(dir, cacheDir);
  if (existsSync(path.join(dir, "package.json"))) {
    return {
      dir,
      source: "cache",
      dependencies: await readDependencies(dir),
      installed: false,
    };
  }

  const { tgz, source } = await downloadTarball(name, version, timeoutMs);
  const staging = `${dir}.tmp-${process.pid}`;
  await rm(staging, { recursive: true, force: true });
  await extractTarball(tgz, staging);
  await rm(dir, { recursive: true, force: true });
  try {
    await rename(staging, dir);
  } catch (error) {
    // Concurrent fetcher won the rename; its extraction is identical.
    await rm(staging, { recursive: true, force: true });
    if (!existsSync(path.join(dir, "package.json"))) throw error;
  }
  return {
    dir,
    source,
    dependencies: await readDependencies(dir),
    installed: false,
  };
}

// Concurrent callers for the same bundle share one download+extract rather
// than racing each other through it.
const inFlight = new Map<string, Promise<FetchedBundle>>();

// The way in: a bundle arrives extracted, cached and loadable, and callers
// that ask for the same one at the same time wait on a single fetch.
export async function ensurePieceBundle(
  options: FetchPieceBundleOptions,
): Promise<FetchedBundle> {
  const key = `${options.cacheDir}\u0000${options.name}@${options.version}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  // Dropped once settled, refusals included, so a later caller re-checks the
  // bundle rather than inheriting this call's answer forever.
  const started = resolveBundle(options).finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}

// 739 of the 760 published pieces declare nothing, and they take the path they
// always took: extract, load, no package manager anywhere near it.

// The rest have their declarations installed beside them, once per name and
// version, and the refusal is what is left when that cannot be done.
async function resolveBundle(
  options: FetchPieceBundleOptions,
): Promise<FetchedBundle> {
  const fetched = await fetchPieceBundle(options);
  if (Object.keys(fetched.dependencies).length === 0) return fetched;
  return installPieceBundle(options, fetched);
}

// Installs a bundle plus its declared deps into an isolated workspace, the way
// their piece-installer does: the bundle as a file: dependency, then install.
async function installPieceBundle(
  options: FetchPieceBundleOptions,
  fetched: FetchedBundle,
): Promise<FetchedBundle> {
  const { name, version, cacheDir } = options;
  const timeoutMs = options.installTimeoutMs ?? INSTALL_TIMEOUT_MS;
  const workspace = path.join(
    cacheDir,
    `${name.replace("/", "-")}-${version}.install`,
  );
  assertWithinCacheDir(workspace, cacheDir);
  const dir = path.join(workspace, "node_modules", name);
  // Written last, so a torn install is never mistaken for a finished one.
  if (
    existsSync(path.join(workspace, INSTALL_READY_MARKER)) &&
    existsSync(path.join(dir, "package.json"))
  ) {
    return {
      dir,
      source: "cache",
      dependencies: fetched.dependencies,
      installed: true,
    };
  }
  try {
    await stageInstallWorkspace(workspace, options);
    await runInstall(workspace, timeoutMs);
    await writeFile(path.join(workspace, INSTALL_READY_MARKER), "true");
  } catch (error) {
    // Swept, so the next attempt starts clean: a half-written node_modules
    // loads worse than none at all, and more confusingly.
    await rm(workspace, { recursive: true, force: true }).catch(
      () => undefined,
    );
    throw notInstallable(name, version, fetched.dependencies, error);
  }
  return {
    dir,
    source: fetched.source,
    dependencies: fetched.dependencies,
    installed: true,
  };
}

// The tarball, not the directory already extracted: npm symlinks a directory
// dependency, and node resolves a symlinked module from its realpath.

// That realpath is back in the cache, where the installed deps are not, so
// the tgz is what makes npm unpack a real directory under node_modules.
async function stageInstallWorkspace(
  workspace: string,
  options: FetchPieceBundleOptions,
): Promise<void> {
  const { tgz } = await downloadTarball(
    options.name,
    options.version,
    options.timeoutMs ?? 30_000,
  );
  await rm(workspace, { recursive: true, force: true });
  await mkdir(workspace, { recursive: true });
  await writeFile(path.join(workspace, "bundle.tgz"), tgz);
  await writeFile(
    path.join(workspace, "package.json"),
    JSON.stringify({
      name: "piece-workspace",
      version: "1.0.0",
      private: true,
      dependencies: { [options.name]: "file:./bundle.tgz" },
    }),
  );
}

// Enough to recognise what the bundle wants without turning the refusal into
// a wall of text.
const MAX_LISTED_DEPENDENCIES = 5;

// Written into the workspace once the install has finished, so a cache hit is
// a finished install and never a torn one.
const INSTALL_READY_MARKER = "ready";

// A published piece pulls a handful of packages at most; this is a bound on a
// hung registry, not a budget. Configurable for a slow or distant mirror.
const INSTALL_TIMEOUT_MS =
  Number(process.env.PH_WORKFLOWS_PIECE_INSTALL_TIMEOUT_MS) || 120_000;

// npm, and only npm. It is on every image that can run this reactor, which bun
// is not, and one package manager is one thing to keep --ignore-scripts true of.

// Activepieces use bun and it is much faster, but the install is cached per
// name and version and off every hot path, so what it would buy is one-off.
function installCommand(): { file: string; args: string[]; shell: boolean } {
  // Windows installs npm as npm.cmd, which only a shell can spawn.
  const windows = process.platform === "win32";
  return {
    file: windows ? "npm.cmd" : "npm",
    // --ignore-scripts is not optional and has no switch to turn it off: it is
    // what makes installing a third party's package at runtime defensible.
    args: [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--omit=dev",
      "--loglevel=error",
    ],
    shell: windows,
  };
}

async function runInstall(cwd: string, timeoutMs: number): Promise<void> {
  const { file, args, shell } = installCommand();
  await new Promise<void>((resolve, reject) => {
    execFile(
      file,
      args,
      // No network of its own to configure and no bunfig to inherit: npm reads
      // the ambient registry config, which is the host's to set.
      { cwd, timeout: timeoutMs, shell, windowsHide: true },
      (error, _stdout, stderr) => {
        if (!error) return resolve();
        const killed = (error as { killed?: boolean }).killed === true;
        // npm's "a complete log of this run" line points at a file nobody
        // reading a reactor log can open; the cause above it is the message.
        const reported = stderr
          .split("\n")
          .filter((line) => !line.includes("A complete log of this run"))
          .join("\n")
          .trim();
        reject(
          new Error(
            killed
              ? `timed out after ${timeoutMs}ms`
              : reported || error.message,
          ),
        );
      },
    );
  });
}

// What is left when a bundle names code it does not carry and that code could
// not be fetched: the piece is unloadable, and this says what was tried.
export class PieceNotInstallableError extends Error {
  constructor(
    readonly packageName: string,
    readonly version: string,
    readonly dependencies: Record<string, string>,
    readonly cause: unknown,
  ) {
    const declared = Object.keys(dependencies);
    const listed = declared
      .slice(0, MAX_LISTED_DEPENDENCIES)
      .map((dep) => `${dep}@${dependencies[dep]}`);
    const rest = declared.length - listed.length;
    const count =
      declared.length === 1
        ? "a dependency"
        : `${declared.length} dependencies`;
    super(
      `Piece bundle ${packageName}@${version} carries ${count} it does not ` +
        `bundle (${listed.join(", ")}${rest > 0 ? `, and ${rest} more` : ""}), ` +
        `and installing them here failed: ${reasonOf(cause)}. ` +
        `The install runs once per version, with lifecycle scripts disabled, so ` +
        `a dependency that builds or downloads on install cannot be prepared ` +
        `this way. Check that this reactor can reach an npm registry, or run a ` +
        `piece whose bundle inlines what it needs.`,
    );
    this.name = "PieceNotInstallableError";
  }
}

function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function notInstallable(
  name: string,
  version: string,
  dependencies: Record<string, string>,
  cause: unknown,
): PieceNotInstallableError {
  return new PieceNotInstallableError(name, version, dependencies, cause);
}

async function readDependencies(dir: string): Promise<Record<string, string>> {
  const raw = await readFile(path.join(dir, "package.json"), "utf8");
  const pkg = JSON.parse(raw) as { dependencies?: Record<string, string> };
  return pkg.dependencies ?? {};
}
