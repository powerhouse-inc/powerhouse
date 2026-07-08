import type { PowerhousePackage } from "@powerhousedao/config";
import type {
  PHConnectPwa,
  PwaContribution,
} from "@powerhousedao/shared/connect";
import { withInferredCategory } from "@powerhousedao/shared/connect";
import { PwaConfigSchema } from "@powerhousedao/shared/document-model";
import { toCdnUrl } from "@powerhousedao/shared/registry/urls";
import fs from "node:fs";
import path from "node:path";
import type { ZodError } from "zod";

// Collects the serialisable `pwa` fragments that build-time-known packages ship
// in their `powerhouse.manifest.json`, from three sources:
//  - the project's own manifest (`collectProjectPwaContribution`);
//  - `provider: "local"` packages, read from node_modules (a package's
//    manifest is emitted to `dist/powerhouse.manifest.json` and exposed via
//    its `./manifest` export, so the Connect build can read it as JSON — no
//    need to execute package code, whose main entry pulls browser-only
//    modules that would crash in Node);
//  - `provider: "registry"` packages, fetched from the registry CDN (they are
//    not installed in node_modules; production Connect loads them from the
//    CDN at runtime, so the CDN copy is the build-time source of truth).
// Fragments are validated with `PwaConfigSchema`; anything unreadable,
// unreachable or malformed is warned about and skipped, never fatal to the
// build. Only the project's `connect.pwa` block is strict — see
// `validateProjectPwaConfig`.

const REGISTRY_FETCH_TIMEOUT_MS = 10_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatZodIssues(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/** Turn a parsed manifest JSON into a contribution: its `pwa` fragment (a
 * malformed one → warn + skip that fragment, not the whole contribution) plus a
 * `categories` entry derived from the manifest's `category` field. Returns null
 * only when the manifest yields neither — no `pwa` and no `category`. */
function toPwaContribution(
  manifest: unknown,
  fallbackLabel: string,
  onWarn: (message: string) => void,
): PwaContribution | null {
  if (!isPlainObject(manifest)) return null;
  const label =
    typeof manifest.name === "string" && manifest.name
      ? manifest.name
      : fallbackLabel;

  let config: PHConnectPwa = {};
  if (manifest.pwa !== undefined) {
    if (!isPlainObject(manifest.pwa)) {
      onWarn(
        `PWA config: ${label} declares a non-object 'pwa' field in its manifest; ignored.`,
      );
    } else {
      const parsed = PwaConfigSchema.safeParse(manifest.pwa);
      if (!parsed.success) {
        onWarn(
          `PWA config: ${label}'s pwa fragment is invalid; ignored. ${formatZodIssues(parsed.error)}`,
        );
      } else {
        config = parsed.data;
      }
    }
  }

  config = withInferredCategory(config, manifest.category);
  if (Object.keys(config).length === 0) return null;
  return { source: label, config };
}

/** Read the first parseable manifest among `candidates` (relative to `dir`)
 * and extract its pwa contribution. Candidates that resolve outside `dir`
 * (a hostile `./manifest` export) are warned about and skipped. */
function readPwaFragmentFromDir(
  dir: string,
  candidates: string[],
  fallbackLabel: string,
  onWarn: (message: string) => void,
): PwaContribution | null {
  for (const rel of candidates) {
    const manifestPath = path.resolve(dir, rel);
    if (path.relative(dir, manifestPath).startsWith("..")) {
      onWarn(
        `PWA config: ${fallbackLabel} declares a manifest path outside its package directory (${rel}); ignored.`,
      );
      continue;
    }
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const manifest: unknown = JSON.parse(
        fs.readFileSync(manifestPath, "utf-8"),
      );
      return toPwaContribution(manifest, fallbackLabel, onWarn);
    } catch {
      onWarn(
        `PWA config: could not parse ${fallbackLabel}'s manifest at ${rel}; ignored.`,
      );
      return null;
    }
  }
  return null;
}

function readLocalPackagePwaFragment(
  projectRoot: string,
  name: string,
  onWarn: (message: string) => void,
): PwaContribution | null {
  const pkgDir = path.join(projectRoot, "node_modules", name);
  let manifestRel: string | undefined;
  try {
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(pkgDir, "package.json"), "utf-8"),
    ) as { exports?: Record<string, unknown> };
    const exported = pkgJson.exports?.["./manifest"];
    if (typeof exported === "string") manifestRel = exported;
  } catch {
    // No package.json / unreadable — fall back to the conventional paths.
  }

  // The package's declared `./manifest` export first, then the conventional
  // build output and source locations.
  const candidates = [
    manifestRel,
    "dist/powerhouse.manifest.json",
    "powerhouse.manifest.json",
  ].filter((rel): rel is string => typeof rel === "string");

  return readPwaFragmentFromDir(pkgDir, candidates, name, onWarn);
}

async function fetchRegistryPwaFragment(
  cdnUrl: string,
  pkg: PowerhousePackage,
  onWarn: (message: string) => void,
  fetchImpl: typeof fetch,
): Promise<PwaContribution | null> {
  // Same version-pinned spec production Connect uses to load the package, so
  // the fragment matches the code that will actually run.
  const spec = pkg.version
    ? `${pkg.packageName}@${pkg.version}`
    : pkg.packageName;
  const url = `${cdnUrl}/${spec}/powerhouse.manifest.json`;
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(REGISTRY_FETCH_TIMEOUT_MS),
    });
    // 404 = the package ships no manifest on the CDN — silent, like a local
    // package without a manifest file.
    if (response.status === 404) return null;
    if (!response.ok) {
      onWarn(
        `PWA config: registry returned ${response.status} for ${spec}'s manifest; its pwa fragment (if any) is skipped.`,
      );
      return null;
    }
    const manifest: unknown = await response.json();
    return toPwaContribution(manifest, pkg.packageName, onWarn);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onWarn(
      `PWA config: could not fetch ${spec}'s manifest from the registry (${message}); its pwa fragment (if any) is skipped.`,
    );
    return null;
  }
}

/**
 * Read the `pwa` fragment of each package in `packages`, in the given order
 * (which becomes their merge precedence — later packages win scalar
 * conflicts). `provider: "local"` packages are read from node_modules;
 * everything else is fetched from the registry CDN (skipped with a warning
 * when `registryUrl` is missing or the registry is unreachable). Packages
 * with no `pwa` fragment are simply absent from the result.
 */
export async function collectPackagePwaContributions(options: {
  packages: PowerhousePackage[];
  projectRoot?: string;
  registryUrl?: string | null;
  onWarn?: (message: string) => void;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}): Promise<PwaContribution[]> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const onWarn = options.onWarn ?? (() => {});
  const fetchImpl = options.fetchImpl ?? fetch;
  const cdnUrl = options.registryUrl ? toCdnUrl(options.registryUrl) : null;

  const results = await Promise.all(
    options.packages.map(async (pkg) => {
      if (pkg.provider === "local") {
        return readLocalPackagePwaFragment(
          projectRoot,
          pkg.packageName,
          onWarn,
        );
      }
      if (!cdnUrl) {
        onWarn(
          `PWA config: no packageRegistryUrl configured; cannot read ${pkg.packageName}'s pwa fragment (if any) from the registry.`,
        );
        return null;
      }
      return fetchRegistryPwaFragment(cdnUrl, pkg, onWarn, fetchImpl);
    }),
  );
  return results.filter(
    (contribution): contribution is PwaContribution => contribution !== null,
  );
}

/**
 * Read the pwa fragment from the project's OWN manifest
 * (`powerhouse.manifest.json` under the project root, falling back to the
 * `dist/` copy the project build emits). The root file comes first — it is
 * the source the dist copy is made from, and a stale dist left by an older
 * build must not shadow it. Returns null silently when no manifest exists —
 * not every project ships one — or when it carries neither a `pwa` block nor a
 * `category` to derive `categories` from.
 *
 * The `pwa` block is parsed STRICTLY, like `connect.pwa` and unlike third-party
 * package fragments: the project's own manifest is the developer's config, so
 * an invalid `pwa` block (a typo, or a removed/unknown field such as
 * `protocol_handlers`) FAILS the build instead of being silently skipped — a
 * silently-dropped field would be far harder to notice.
 */
export function collectProjectPwaContribution(options: {
  projectRoot?: string;
}): PwaContribution | null {
  const projectRoot = options.projectRoot ?? process.cwd();
  for (const rel of [
    "powerhouse.manifest.json",
    "dist/powerhouse.manifest.json",
  ]) {
    const manifestPath = path.resolve(projectRoot, rel);
    if (!fs.existsSync(manifestPath)) continue;
    let manifest: unknown;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not parse ${manifestPath}: ${message}`);
    }
    if (!isPlainObject(manifest)) return null;
    const label =
      typeof manifest.name === "string" && manifest.name
        ? manifest.name
        : "project manifest";
    const config =
      manifest.pwa === undefined
        ? {}
        : parsePwaConfigStrict(manifest.pwa, `pwa in ${manifestPath}`);
    const withCategory = withInferredCategory(config, manifest.category);
    if (Object.keys(withCategory).length === 0) return null;
    return { source: label, config: withCategory };
  }
  return null;
}

/** Strictly parse a PWA config block, throwing a build-failing error (naming
 * the offending field) when it is invalid. Used for the developer's own config
 * (`connect.pwa` and the project manifest's `pwa`), where a silent drop would
 * be a footgun — unlike third-party package fragments, which warn + skip. */
function parsePwaConfigStrict(
  config: unknown,
  description: string,
): PHConnectPwa {
  const parsed = PwaConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(
      `Invalid ${description}: ${formatZodIssues(parsed.error)}. Fix it or remove the field.`,
    );
  }
  return parsed.data;
}

/**
 * Validate the project's `connect.pwa` block. Unlike package fragments
 * (third-party, warn + skip), the user's own config fails the build: a typo
 * that silently dropped offline coverage would be far harder to notice.
 */
export function validateProjectPwaConfig(
  config: unknown,
  configPath: string,
): PHConnectPwa {
  return parsePwaConfigStrict(config, `connect.pwa in ${configPath}`);
}
