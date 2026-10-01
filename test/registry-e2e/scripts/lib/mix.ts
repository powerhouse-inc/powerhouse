// A weighted mix of registry reads over a set of published probe packages.
export interface SeedPackage {
  name: string;
  version: string;
  piece: string;
}

export type Route =
  | "cdn-file"
  | "piece-bundle"
  | "piece-version"
  | "npm-metadata"
  | "npm-tarball"
  | "pieces"
  | "packages"
  | "packages-search"
  | "package-detail";

// Roughly what reactors and Connect ask for: files and bundles dominate.
// List routes answer one page.
export const READ_MIX: Record<Route, number> = {
  "cdn-file": 30,
  "piece-bundle": 20,
  "piece-version": 15,
  "npm-metadata": 10,
  "npm-tarball": 10,
  pieces: 5,
  packages: 3,
  "packages-search": 2,
  "package-detail": 5,
};

function shortName(name: string): string {
  return name.startsWith("@") ? name.split("/")[1] : name;
}

// "legacy": origin/main's paths, a flat bundle name and paged listings via `limit`
export type RouteStyle = "stateless" | "legacy";

const LEGACY_PAGE = "limit=30";

export function routePath(
  route: Route,
  pkg: SeedPackage,
  style: RouteStyle = "stateless",
): string {
  const legacy = style === "legacy";
  switch (route) {
    case "cdn-file":
      return `/-/cdn/${pkg.name}@${pkg.version}/dist/powerhouse.manifest.json`;
    case "piece-bundle":
      return legacy
        ? `/-/pieces/bundled/${pkg.piece.replace("/", "-")}-${pkg.version}.tgz`
        : `/-/pieces/bundled/${pkg.piece}/${pkg.version}.tgz`;
    case "piece-version":
      return `/pieces/${pkg.piece}?version=${pkg.version}`;
    case "npm-metadata":
      return `/${pkg.name}`;
    case "npm-tarball":
      return `/${pkg.name}/-/${shortName(pkg.name)}-${pkg.version}.tgz`;
    case "pieces":
      return "/pieces";
    case "packages":
      return legacy ? `/packages?${LEGACY_PAGE}` : "/packages";
    case "packages-search": {
      const search = `search=${encodeURIComponent(shortName(pkg.name))}`;
      return legacy
        ? `/packages?${LEGACY_PAGE}&${search}`
        : `/packages?${search}`;
    }
    case "package-detail":
      return `/packages/${pkg.name}`;
  }
}

/** Picks routes in proportion to their weights. */
export function picker(mix: Partial<Record<Route, number>>): () => Route {
  const entries = Object.entries(mix) as [Route, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  return () => {
    let roll = Math.random() * total;
    for (const [route, weight] of entries) {
      roll -= weight;
      if (roll < 0) return route;
    }
    return entries[entries.length - 1][0];
  };
}

// A query NGINX keys on and the registry ignores, so every read reaches it
export function bust(path: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}_nocache=${Math.random().toString(36).slice(2)}`;
}
