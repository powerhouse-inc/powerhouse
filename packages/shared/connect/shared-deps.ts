import { satisfies, validRange } from "semver";

export type SharedDep = { specifier: string; package: string };

/**
 * The dependency set Connect and loaded packages share via the import map.
 * `@powerhousedao/connect` is deliberately absent: it is the Connect app
 * itself (no importable exports), so there is nothing to share.
 */
export const SHARED_DEPS: readonly SharedDep[] = [
  { specifier: "document-model", package: "document-model" },
  {
    specifier: "@powerhousedao/document-engineering",
    package: "@powerhousedao/document-engineering",
  },
  { specifier: "@powerhousedao/shared", package: "@powerhousedao/shared" },
  {
    specifier: "@powerhousedao/shared/registry/urls",
    package: "@powerhousedao/shared",
  },
  {
    specifier: "@powerhousedao/design-system/connect",
    package: "@powerhousedao/design-system",
  },
  {
    specifier: "@powerhousedao/reactor-browser",
    package: "@powerhousedao/reactor-browser",
  },
  // Connect already vendors zod (it is in DEFAULT_VENDOR_INCLUDE, so the
  // import map publishes an entry for it) and every generated project already
  // declares it as a peerDependency -- yet it was missing from this set, so
  // each package inlined a private copy anyway. It is the single biggest
  // dependency left in a minimal package.
  { specifier: "zod", package: "zod" },
];

export const SHARED_DEP_SPECIFIERS: readonly string[] = SHARED_DEPS.map(
  (d) => d.specifier,
);

/**
 * The `@powerhousedao/shared` subpaths the production vendor bundles. The
 * bare root is deliberately absent: its type barrel references node-only
 * modules (`clis/`), which the current vite/rolldown cannot bundle for the
 * browser — vendoring the root fails the build (a pre-existing latent
 * issue). A package that imports the bare root is simply not shared; it
 * bundles its own copy.
 */
export const SHARED_SUBPATHS: readonly string[] = [
  "connect",
  "document-model",
  "processors",
  "document-drive",
  "registry",
  "registry/urls",
  "registry/manifest-slim",
];

/**
 * The specifiers a package build may safely externalize onto the host's
 * import map — i.e. the ones the vendor actually publishes an entry for.
 *
 * `@powerhousedao/shared` is narrowed to SHARED_SUBPATHS rather than taken as
 * a prefix: the bare root is never vendored (see SHARED_SUBPATHS), and
 * neither are its other subpaths (`analytics`, `constants`, `clis`, ...).
 * Externalizing those would leave a bare specifier in the package's output
 * that nothing in the import map resolves, so the package would fail to load
 * at runtime instead of simply bundling its own copy.
 */
export const EXTERNALIZABLE_SHARED_SPECIFIERS: readonly string[] = [
  ...new Set([
    ...SHARED_DEP_SPECIFIERS.filter((s) => s !== "@powerhousedao/shared"),
    ...SHARED_SUBPATHS.map((s) => `@powerhousedao/shared/${s}`),
  ]),
];

/** Split a specifier into its package name and subpath ("" for a root). */
export function parseDepSpec(spec: string): { pkg: string; sub: string } {
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    return { pkg: parts.slice(0, 2).join("/"), sub: parts.slice(2).join("/") };
  }
  const i = spec.indexOf("/");
  return i === -1
    ? { pkg: spec, sub: "" }
    : { pkg: spec.slice(0, i), sub: spec.slice(i + 1) };
}

function isSharedSpecifier(spec: string, specs: readonly string[]): boolean {
  return specs.some((s) => spec === s || spec.startsWith(s + "/"));
}

/**
 * Return the import/export specifiers in `source` that are a shared
 * specifier (or a subpath of one), sorted. Heuristic: only statement
 * positions are scanned (`from "x"`, `import "x"`, `import("x")`;
 * `export … from "x"` is covered by the `from` pattern), so import-like
 * text inside comments or strings can be reported too. That errs toward
 * over-reporting, which is the safe direction for the advisory build
 * warning.
 */
export function findSharedImports(
  source: string,
  specs: readonly string[] = SHARED_DEP_SPECIFIERS,
): string[] {
  const found = new Set<string>();
  const patterns = [
    /\bfrom\s+["']([^"'\\]+)["']/g,
    /\bimport\s+["']([^"'\\]+)["']/g,
    /\bimport\s*\(\s*["']([^"'\\]+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) {
      const spec = m[1];
      if (isSharedSpecifier(spec, specs)) found.add(spec);
    }
  }
  return [...found].sort();
}

/**
 * Rewrite a package source for blob import in a worker context (import maps
 * don't apply there): shared specifiers become their mapped URLs, and
 * relative (`./`, `../`) specifiers become absolute against `sourceUrl`
 * (a blob URL has no directory to resolve against). `#` subpath imports are
 * deliberately left alone: they resolve via the package's own
 * `package.json` "imports" field, which the rewrite cannot reproduce.
 * Returns the input unchanged when nothing matched.
 */
export function rewritePackageSource(
  source: string,
  sourceUrl: string,
  imports: Record<string, string>,
): string {
  if (!Object.keys(imports).length) return source;
  const base = new URL(sourceUrl);
  const map = (spec: string): string | null => {
    const mapped = imports[spec];
    if (mapped) return mapped;
    if (spec.startsWith("./") || spec.startsWith("../")) {
      return new URL(spec, base).href;
    }
    return null;
  };
  let out = source;
  // The quote character is captured and reused: a source that quotes its
  // specifiers with ' would otherwise never match the replacement and be
  // left un-rewritten — silently, since the specifier still maps.
  for (const re of [
    /\bfrom\s+(["'])([^"'\\]+)\1/g,
    /\bimport\s+(["'])([^"'\\]+)\1/g,
    /\bimport\s*\(\s*(["'])([^"'\\]+)\1\s*\)/g,
  ]) {
    out = out.replace(re, (match, quote: string, spec: string) => {
      // The match contains the quoted specifier exactly once and the
      // captured group has no quotes/backslashes ([^"'\\]), so a literal
      // replace is safe.
      const mapped = map(spec);
      return mapped
        ? match.replace(`${quote}${spec}${quote}`, `${quote}${mapped}${quote}`)
        : match;
    });
  }
  return out;
}

export type SharedDepMismatch = {
  package: string;
  required: string;
  provided: string;
};

export type PackageDeps = {
  dependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
};

/**
 * Compare a package's declared ranges against the host's version table.
 * `hostVersions` defines the checked set (only deps present in it are
 * checked). `*`, non-semver protocols (workspace:, file:, git:, npm:, URLs)
 * and unparseable ranges never mismatch.
 */
export function checkSharedDeps(
  pkgJson: PackageDeps,
  hostVersions: Record<string, string>,
): SharedDepMismatch[] {
  const out: SharedDepMismatch[] = [];
  const entries = [
    ...Object.entries(pkgJson.dependencies ?? {}),
    ...Object.entries(pkgJson.peerDependencies ?? {}),
  ];
  for (const [dep, range] of entries) {
    const provided = hostVersions[dep];
    if (provided === undefined || typeof range !== "string") continue;
    if (range === "*" || /^[a-z]+:/i.test(range)) continue;
    if (!validRange(range)) continue;
    if (!satisfies(provided, range, { includePrerelease: true })) {
      out.push({ package: dep, required: range, provided });
    }
  }
  return out;
}

export function formatSharedDepWarnings(
  mismatches: SharedDepMismatch[],
): string[] {
  return mismatches.map(
    (m) =>
      `${m.package}: requires ${m.required}, Connect provides ${m.provided}`,
  );
}
