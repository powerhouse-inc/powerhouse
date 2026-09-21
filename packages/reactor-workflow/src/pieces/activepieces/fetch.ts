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
}

/** Where a bundle came from, "cache" being a copy one of the others left. */
export type BundleSource = "registry" | "cdn" | "npm";

export interface FetchedBundle {
  dir: string;
  source: BundleSource | "cache";
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
    await assertSelfContained(dir, name, version);
    return { dir, source: "cache" };
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
  // Checked here rather than before the rename so a bundle an older build
  // already extracted is refused on its cache hit too, not only a fresh one.
  await assertSelfContained(dir, name, version);
  return { dir, source };
}

// Concurrent callers for the same bundle share one download+extract rather
// than racing each other through it.
const inFlight = new Map<string, Promise<FetchedBundle>>();

// The way in: a bundle arrives extracted, cached and checked, and callers that
// ask for the same one at the same time wait on a single fetch.
export async function ensurePieceBundle(
  options: FetchPieceBundleOptions,
): Promise<FetchedBundle> {
  const key = `${options.cacheDir}\u0000${options.name}@${options.version}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  // Dropped once settled, refusals included, so a later caller re-checks the
  // bundle rather than inheriting this call's answer forever.
  const started = fetchPieceBundle(options).finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}

// The Activepieces release that began inlining a piece's dependencies into its
// bundle. They still publish pieces to npm, which is why npm stays a source.
const AP_SELF_CONTAINED_SINCE = "0.86.0";

// Enough to recognise what the bundle wants without turning the refusal into
// a wall of text.
const MAX_LISTED_DEPENDENCIES = 5;

// A bundle has to carry its own code: the worker imports it straight out of the
// cache directory, where there is no node_modules and nothing to install one.
async function assertSelfContained(
  dir: string,
  name: string,
  version: string,
): Promise<void> {
  const dependencies = await readDependencies(dir);
  const declared = Object.keys(dependencies);
  if (declared.length === 0) return;
  const listed = declared
    .slice(0, MAX_LISTED_DEPENDENCIES)
    .map((dep) => `${dep}@${dependencies[dep]}`);
  const rest = declared.length - listed.length;
  const count =
    declared.length === 1 ? "a dependency" : `${declared.length} dependencies`;
  // Only an Activepieces piece gets their release number: a bundle from
  // anywhere else would be sent chasing a version that means nothing to it.
  const since = name.startsWith("@activepieces/")
    ? ` Activepieces bundles have been self-contained since ${AP_SELF_CONTAINED_SINCE}.`
    : "";
  throw new Error(
    `Piece bundle ${name}@${version} is not self-contained: it declares ${count} ` +
      `(${listed.join(", ")}${rest > 0 ? `, and ${rest} more` : ""}). ` +
      `The reactor no longer installs a bundle's dependencies. Pin ${name} at or above ` +
      `its first self-contained release.${since}`,
  );
}

async function readDependencies(dir: string): Promise<Record<string, string>> {
  const raw = await readFile(path.join(dir, "package.json"), "utf8");
  const pkg = JSON.parse(raw) as { dependencies?: Record<string, string> };
  return pkg.dependencies ?? {};
}
