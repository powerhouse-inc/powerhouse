import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip as gunzipCb } from "node:zlib";

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
async function extractTarball(
  tgz: Buffer,
  dest: string,
  maxExtractedBytes = MAX_EXTRACTED_BYTES,
): Promise<void> {
  // Async gunzip: the sync one blocks the reactor's event loop for every
  // request, not just this one, and inflation is unbounded without maxOutputLength.
  const tar = await gunzip(tgz, { maxOutputLength: maxExtractedBytes }).catch(
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
  /** Compressed transfer cap in bytes; defaults to 64 MB. */
  maxCompressedBytes?: number;
  /** Decompressed size cap in bytes; defaults to 64 MB. */
  maxExtractedBytes?: number;
}

export interface FetchedBundle {
  dir: string;
  source: "cdn" | "npm" | "cache";
  // Declared runtime deps. Non-empty means the bundle is NOT self-contained:
  // import() will fail without a package-manager install (their engine bun-installs the tgz).
  dependencies: Record<string, string>;
  // True when the bundle was installed with its dependencies (see installPieceBundle).
  installed: boolean;
}

// Bounds the transfer before gunzip: rejects an over-limit Content-Length up
// front, else tracks a running total as the body streams in.
async function readBoundedBody(
  response: Response,
  url: string,
  maxCompressedBytes = MAX_COMPRESSED_BYTES,
): Promise<Buffer> {
  const declared = response.headers.get("content-length");
  if (declared && Number(declared) > maxCompressedBytes) {
    throw new Error(
      `${url} exceeds the ${maxCompressedBytes}-byte compressed size cap (Content-Length: ${declared})`,
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
    if (total > maxCompressedBytes) {
      await reader.cancel();
      throw new Error(
        `${url} exceeds the ${maxCompressedBytes}-byte compressed size cap`,
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function downloadTarball(
  name: string,
  version: string,
  timeoutMs: number,
  maxCompressedBytes = MAX_COMPRESSED_BYTES,
): Promise<{ tgz: Buffer; source: "cdn" | "npm" }> {
  const sources: { source: "cdn" | "npm"; url: string }[] = [
    { source: "cdn", url: cdnTarballUrl(name, version) },
    { source: "npm", url: npmTarballUrl(name, version) },
  ];
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
      return {
        tgz: await readBoundedBody(response, url, maxCompressedBytes),
        source,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Failed to fetch piece bundle ${name}@${version}: ${String(lastError)}`,
  );
}

// Downloads and extracts a published piece bundle, returning the directory to
// hand to loadPieceFromDir(). Cached extractions are reused as-is.
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

  const { tgz, source } = await downloadTarball(
    name,
    version,
    timeoutMs,
    options.maxCompressedBytes,
  );
  const staging = `${dir}.tmp-${process.pid}`;
  await rm(staging, { recursive: true, force: true });
  await extractTarball(tgz, staging, options.maxExtractedBytes);
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

// Installs a bundle plus its declared deps into an isolated workspace, the way
// their piece-installer does (tgz as a file: dependency), then a package-manager install.
export async function installPieceBundle(
  options: FetchPieceBundleOptions,
): Promise<FetchedBundle> {
  const { name, version, cacheDir, timeoutMs = 120_000 } = options;
  assertValidPackageCoordinate(name, version);
  const workspace = path.join(
    cacheDir,
    `${name.replace("/", "-")}-${version}.install`,
  );
  assertWithinCacheDir(workspace, cacheDir);
  const dir = path.join(workspace, "node_modules", name);
  if (
    existsSync(path.join(workspace, "ready")) &&
    existsSync(path.join(dir, "package.json"))
  ) {
    return {
      dir,
      source: "cache",
      dependencies: await readDependencies(dir),
      installed: true,
    };
  }

  const { tgz, source } = await downloadTarball(
    name,
    version,
    timeoutMs,
    options.maxCompressedBytes,
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
      dependencies: { [name]: "file:./bundle.tgz" },
    }),
  );
  // --ignore-scripts: never run lifecycle scripts from piece manifests.
  await runNpmInstall(workspace, timeoutMs);
  await writeFile(path.join(workspace, "ready"), "true");
  return {
    dir,
    source,
    dependencies: await readDependencies(dir),
    installed: true,
  };
}

// Concurrent callers for the same bundle share one download+extract (or
// install) rather than racing each other through it.
const inFlight = new Map<string, Promise<FetchedBundle>>();

// Fetches a bundle; when it declares dependencies (not self-contained),
// installs it instead so import() can resolve them.
export async function ensurePieceBundle(
  options: FetchPieceBundleOptions,
): Promise<FetchedBundle> {
  const key = `${options.cacheDir}\u0000${options.name}@${options.version}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const started = resolveBundle(options).finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}

async function resolveBundle(
  options: FetchPieceBundleOptions,
): Promise<FetchedBundle> {
  const fetched = await fetchPieceBundle(options);
  if (Object.keys(fetched.dependencies).length === 0) {
    return fetched;
  }
  return installPieceBundle(options);
}

async function runNpmInstall(cwd: string, timeoutMs: number): Promise<void> {
  // Windows installs npm as npm.cmd, which only a shell can spawn.
  const windows = process.platform === "win32";
  await new Promise<void>((resolve, reject) => {
    execFile(
      windows ? "npm.cmd" : "npm",
      [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--loglevel=error",
      ],
      { cwd, timeout: timeoutMs, shell: windows },
      (error, _stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `npm install failed in ${cwd}: ${stderr || error.message}`,
            ),
          );
        } else {
          resolve();
        }
      },
    );
  });
}

async function readDependencies(dir: string): Promise<Record<string, string>> {
  const raw = await readFile(path.join(dir, "package.json"), "utf8");
  const pkg = JSON.parse(raw) as { dependencies?: Record<string, string> };
  return pkg.dependencies ?? {};
}
