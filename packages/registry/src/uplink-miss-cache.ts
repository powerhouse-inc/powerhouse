import { API_ERROR, errorUtils } from "@verdaccio/core";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Most names each uplink remembers a 404 for
export const UPLINK_MISS_CACHE_LIMIT = 10_000;

const WRAPPED = Symbol.for("powerhouse.registry.uplinkMissCache");

type GetRemoteMetadata = ((
  name: string,
  options: unknown,
) => Promise<unknown>) & { [WRAPPED]?: true };

export interface ProxyStorageLike {
  maxage: number;
  getRemoteMetadata: GetRemoteMetadata;
}

interface ProxyModule {
  ProxyStorage?: { prototype: ProxyStorageLike };
}

interface PackageJson {
  name?: string;
  main?: string;
  exports?: Record<string, { import?: { default?: string } } | string>;
}

// Root of `pkg` as Node resolves it from `fromDir`
function packageDir(fromDir: string, pkg: string): string {
  const entry = createRequire(path.join(fromDir, "noop.js")).resolve(pkg);
  let dir = path.dirname(entry);
  while (dir !== path.dirname(dir)) {
    try {
      const file = path.join(dir, "package.json");
      const json = JSON.parse(readFileSync(file, "utf8")) as PackageJson;
      if (json.name === pkg) return dir;
    } catch {
      // No package.json at this level
    }
    dir = path.dirname(dir);
  }
  throw new Error(`[registry] cannot locate ${pkg} from ${fromDir}`);
}

function entries(dir: string): { esm: string; cjs: string } {
  const json = JSON.parse(
    readFileSync(path.join(dir, "package.json"), "utf8"),
  ) as PackageJson;
  const root = json.exports?.["."];
  const esm = typeof root === "object" ? root.import?.default : undefined;
  if (!esm || !json.main) {
    throw new Error(`[registry] unexpected package layout in ${dir}`);
  }
  return { esm: path.join(dir, esm), cjs: path.join(dir, json.main) };
}

const isUplinkNotFound = (err: unknown) =>
  (err as { message?: string } | null)?.message ===
  API_ERROR.NOT_PACKAGE_UPLINK;

export function wrapGetRemoteMetadata(proto: ProxyStorageLike, limit: number) {
  const original = proto.getRemoteMetadata;
  if (typeof original !== "function") {
    throw new Error(
      "[registry] @verdaccio/proxy ProxyStorage has no getRemoteMetadata; the uplink 404 cache needs updating",
    );
  }
  if (original[WRAPPED]) return;
  const misses = new WeakMap<ProxyStorageLike, Map<string, number>>();

  const wrapped: GetRemoteMetadata = async function (
    this: ProxyStorageLike,
    name,
    options,
  ) {
    let seen = misses.get(this);
    if (!seen) misses.set(this, (seen = new Map<string, number>()));
    const at = seen.get(name);
    if (at !== undefined) {
      seen.delete(name);
      if (Date.now() - at < this.maxage) {
        // Re-insert so recently asked names sit at the LRU tail
        seen.set(name, at);
        throw errorUtils.getNotFound(API_ERROR.NOT_PACKAGE_UPLINK);
      }
    }
    try {
      return await original.call(this, name, options);
    } catch (err) {
      if (isUplinkNotFound(err)) {
        seen.set(name, Date.now());
        if (seen.size > limit) seen.delete(seen.keys().next().value!);
      }
      throw err;
    }
  };
  wrapped[WRAPPED] = true;
  proto.getRemoteMetadata = wrapped;
}

// Makes each Verdaccio uplink remember a 404 for `maxage`, as it does a hit;
// Verdaccio records `_uplinks.fetched` only when the uplink answers.
export async function installUplinkMissCache(
  limit = UPLINK_MISS_CACHE_LIMIT,
): Promise<void> {
  // Follow Verdaccio's own resolution so the patched class is the one it loads
  const verdaccio = packageDir(import.meta.dirname, "verdaccio");
  const store = packageDir(verdaccio, "@verdaccio/store");
  const proxy = entries(packageDir(store, "@verdaccio/proxy"));

  const esm = (await import(pathToFileURL(proxy.esm).href)) as ProxyModule;
  const cjs = createRequire(proxy.cjs)(proxy.cjs) as ProxyModule;
  for (const mod of [esm, cjs]) {
    if (!mod.ProxyStorage) {
      throw new Error(
        "[registry] @verdaccio/proxy no longer exports ProxyStorage",
      );
    }
    wrapGetRemoteMetadata(mod.ProxyStorage.prototype, limit);
  }
}
