import { resolveDynamicBaseUrl } from "@powerhousedao/shared/connect";

// Set by `ph connect build`: the content-hashed shared-deps module URL.
declare const PH_CONNECT_SHARED_DEPS_URL: string | undefined;

function builtSharedDepsUrl(): string | undefined {
  return typeof PH_CONNECT_SHARED_DEPS_URL !== "undefined"
    ? PH_CONNECT_SHARED_DEPS_URL
    : undefined;
}

/** The shared-deps module URL: this build's hashed copy, else the stable dev path. */
export function sharedDepsModuleUrl(
  runtimeBase: string,
  built: string | undefined = builtSharedDepsUrl(),
): string {
  return built
    ? resolveDynamicBaseUrl(built, runtimeBase)
    : `${runtimeBase}__vendor__/shared-deps.js`;
}

export type SharedDeps = {
  imports: Record<string, string>;
  versions: Record<string, string>;
};

/**
 * Resolve the vendor's import-map values to absolute URLs: the
 * dynamic-base placeholder (present in dynamic-base builds) is replaced
 * with the runtime base — which `import.meta.env.BASE_URL` already is,
 * since the dynamic-base plugin rewrites it to the resolved base — and
 * the result is made absolute against the page origin. Absolute URLs are
 * what the worker needs: its imports have no document context, so
 * relative or placeholder-based values would not resolve there.
 */
export function normalizeVendorImports(
  rawImports: Record<string, string>,
  runtimeBase: string,
): Record<string, string> {
  // `location` is a browser global; the fallback keeps the helper usable
  // from node-based tests, where no origin exists.
  const origin =
    (globalThis as { location?: Location }).location?.origin ??
    "http://localhost";
  return Object.fromEntries(
    Object.entries(rawImports).map(([spec, value]) => [
      spec,
      new URL(resolveDynamicBaseUrl(value, runtimeBase), origin).href,
    ]),
  );
}

let cached: Promise<SharedDeps | null> | null = null;

/**
 * The production vendor's shared-deps table: import-map entries for the
 * shared dependency set plus the resolved version of every shared package
 * in this build. Fails soft (`null`) when the vendor is not present (dev,
 * or a `PH_CONNECT_VENDOR=0` build) — callers treat that as "no sharing".
 * The promise is cached: the vendor table is immutable per build.
 */
export function getSharedDeps(): Promise<SharedDeps | null> {
  cached ??= (async () => {
    try {
      const mod = (await import(
        /* @vite-ignore */ sharedDepsModuleUrl(import.meta.env.BASE_URL)
      )) as {
        imports: Record<string, string>;
        versions: Record<string, string>;
      };
      return {
        imports: normalizeVendorImports(mod.imports, import.meta.env.BASE_URL),
        versions: mod.versions,
      };
    } catch {
      return null;
    }
  })();
  return cached;
}
