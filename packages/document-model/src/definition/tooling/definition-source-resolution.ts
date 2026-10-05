import {
  ConfigFileError,
  getConfigStrict,
} from "@powerhousedao/shared/clis/config-strict";
import {
  parseDefinitionSourceOption,
  parseDefinitionSourcesConfig,
} from "@powerhousedao/shared/clis/definition-sources";
import type {
  DefinitionDiagnostic,
  DefinitionPath,
  DefinitionSource,
} from "@powerhousedao/shared/document-model";
import { existsSync, realpathSync } from "node:fs";
import { dirname, posix, resolve, sep } from "node:path";
import {
  compareDefinitionDiagnostics,
  compareDefinitionPaths,
  createDiagnostic,
  type DefinitionDiagnosticCode,
} from "../diagnostics.js";
import { canonicalDigest, compareCodeUnits } from "../primitives.js";
import type {
  DefinitionSourceOrigin,
  DefinitionSourceResolution,
  DefinitionSourceSelectionRequest,
  DefinitionSourceSet,
} from "./definition-source-types.js";
import { relativePathWithin } from "./file-path.js";

/**
 * Turns a config file and a `--source` list into the exact set of modules a
 * command will import.
 *
 * It is deliberately separate from importing. `ph model inspect` and `ph build`
 * both need to know which sources were selected before anything is evaluated,
 * and a build that re-derived the set separately from the check that approved
 * it could ship a module the check never saw.
 *
 * Nothing here reads a directory listing. A module becomes a definition root
 * because a human wrote it down, never because it sits in a particular folder.
 */

/** A resolved entry, plus the machine-specific identity the loader dedupes on. */
export type ResolvedDefinitionSource = {
  readonly source: DefinitionSource;
  /** Where this entry was written: a config path or a CLI position. */
  readonly position: DefinitionPath;
  /**
   * Absolute real path of the module. Two spellings of one file share it, so
   * duplicates are caught before either is imported. It never reaches a report.
   */
  readonly moduleIdentity: string;
};

type InternalResolution = DefinitionSourceResolution & {
  readonly packageRootIdentity: string;
  readonly resolved: readonly ResolvedDefinitionSource[];
};

const CONFIG_FILE_NAME = "./powerhouse.config.json";

/** Joins a real path and an export path; no path segment can contain it. */
const IDENTITY_SEPARATOR = String.fromCharCode(0);

/** A report carries no machine path, so an untrusted value is rendered, not embedded. */
function render(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  try {
    // `JSON.stringify` is typed as returning a string, and returns `undefined`
    // for a function or a symbol. Both reach here: this renders whatever a
    // config file held.
    const json = JSON.stringify(value) as string | undefined;
    return json === undefined ? typeof value : json;
  } catch {
    return typeof value;
  }
}

function sourceSet(
  mode: DefinitionSourceSet["mode"],
  origin: DefinitionSourceOrigin,
  sources: readonly DefinitionSource[],
): DefinitionSourceSet {
  const value = { mode, origin, sources };
  return { ...value, digest: canonicalDigest(value) };
}

export function compareDefinitionSources(
  left: DefinitionSource,
  right: DefinitionSource,
): number {
  const specifier = compareCodeUnits(left.specifier, right.specifier);
  if (specifier !== 0) return specifier;
  const leftPath = left.exportPath ?? [];
  const rightPath = right.exportPath ?? [];
  const shared = Math.min(leftPath.length, rightPath.length);
  for (let index = 0; index < shared; index += 1) {
    const segment = compareCodeUnits(leftPath[index], rightPath[index]);
    if (segment !== 0) return segment;
  }
  return leftPath.length - rightPath.length;
}

/** Control characters and non-NFC text let one path spell two identities. */
function isCanonicalText(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    ) {
      return false;
    }
  }
  return value.normalize("NFC") === value;
}

function isCanonicalExportPath(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (segment) => typeof segment === "string" && isCanonicalText(segment),
    )
  );
}

type SpecifierResult =
  | { readonly ok: true; readonly specifier: `./${string}` }
  | {
      readonly ok: false;
      readonly code:
        | "PH-CONFIG-SOURCE-INVALID"
        | "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE";
      readonly message: string;
    };

export function normalizeDefinitionSourceSpecifier(
  value: string,
): SpecifierResult {
  if (
    !value.startsWith("./") ||
    value.includes("\\") ||
    value.includes("#") ||
    value.includes("?") ||
    !isCanonicalText(value)
  ) {
    return {
      ok: false,
      code: "PH-CONFIG-SOURCE-INVALID",
      message:
        "A definition source is a POSIX package-relative path beginning with './'.",
    };
  }
  const normalized = posix.normalize(value.slice(2));
  if (normalized === ".") {
    return {
      ok: false,
      code: "PH-CONFIG-SOURCE-INVALID",
      message: "A definition source names a module file, not the package root.",
    };
  }
  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    posix.isAbsolute(normalized)
  ) {
    return {
      ok: false,
      code: "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
      message: "The normalized definition source path leaves the package root.",
    };
  }
  return { ok: true, specifier: `./${normalized}` };
}

/**
 * Resolves symlinks as far as the path exists. A source that has not been
 * written yet still has to be judged against the package root, and `realpath`
 * on a missing file throws.
 */
function realPathThroughExistingParent(path: string): string {
  let current = path;
  const suffix: string[] = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return path;
    suffix.unshift(
      current.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)),
    );
    current = parent;
  }
  return resolve(realpathSync.native(current), ...suffix);
}

type EntryResult =
  | { readonly source: ResolvedDefinitionSource }
  | { readonly diagnostic: DefinitionDiagnostic };

function normalizeEntry(
  value: unknown,
  position: DefinitionPath,
  packageRoot: string,
  packageRootIdentity: string,
): EntryResult {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return {
      diagnostic: createDiagnostic({
        code: "PH-CONFIG-SOURCE-INVALID",
        path: position,
        message: "A definition source entry must be a plain object.",
        expected: "{ specifier, exportPath? }",
        received: render(value),
        repair: 'Replace this entry with { "specifier": "./src/<module>.ts" }.',
      }),
    };
  }
  const entry = value as Record<string, unknown>;
  const extra = Object.keys(entry)
    .filter((key) => key !== "specifier" && key !== "exportPath")
    .sort(compareCodeUnits);
  if (extra.length > 0) {
    return {
      diagnostic: createDiagnostic({
        code: "PH-CONFIG-SOURCE-INVALID",
        path: position,
        message: "A definition source entry carries unsupported properties.",
        expected: "specifier and optional exportPath",
        received: extra.join(", "),
        repair: `Remove ${extra.join(", ")} from this entry.`,
      }),
    };
  }
  if (typeof entry.specifier !== "string") {
    return {
      diagnostic: createDiagnostic({
        code: "PH-CONFIG-SOURCE-INVALID",
        path: [...position, "specifier"],
        message: "A definition source specifier must be a string.",
        expected: "a './' POSIX package-relative path",
        received: render(entry.specifier),
        repair: "Set specifier to the package-relative TypeScript module path.",
      }),
    };
  }
  const normalized = normalizeDefinitionSourceSpecifier(entry.specifier);
  if (!normalized.ok) {
    return {
      diagnostic: createDiagnostic({
        code: normalized.code,
        path: [...position, "specifier"],
        message: normalized.message,
        expected: "a './' path contained by the selected package root",
        received: entry.specifier,
        repair:
          "Move the module inside the package and spell its path relative to the config file.",
      }),
    };
  }
  const { specifier } = normalized;

  let exportPath: readonly string[] | undefined;
  if (entry.exportPath !== undefined) {
    if (!isCanonicalExportPath(entry.exportPath)) {
      return {
        diagnostic: createDiagnostic({
          code: "PH-CONFIG-SOURCE-INVALID",
          source: { specifier },
          path: [...position, "exportPath"],
          message:
            "An exportPath is an array of exact property keys in NFC, without control characters.",
          expected: "an array of property-key strings",
          received: render(entry.exportPath),
          repair:
            "Replace exportPath with the exported property keys, outermost first.",
        }),
      };
    }
    if (entry.exportPath.length > 0) exportPath = [...entry.exportPath];
  }

  const source: DefinitionSource =
    exportPath === undefined ? { specifier } : { specifier, exportPath };
  const declaredPath = resolve(packageRoot, ...specifier.slice(2).split("/"));
  if (relativePathWithin(packageRoot, declaredPath) === null) {
    return {
      diagnostic: createDiagnostic({
        code: "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
        source,
        path: [...position, "specifier"],
        message: "The definition source path leaves the selected package root.",
        expected: "a path contained by the package root",
        received: specifier,
        repair: "Move the module into the package and update its specifier.",
      }),
    };
  }

  let moduleIdentity: string;
  try {
    moduleIdentity = realPathThroughExistingParent(declaredPath);
  } catch {
    return {
      diagnostic: createDiagnostic({
        code: "PH-CONFIG-SOURCE-INVALID",
        source,
        path: [...position, "specifier"],
        message: "The definition source path could not be resolved.",
        expected: "a resolvable path inside the package root",
        received: specifier,
        repair:
          "Fix the path, or the permissions of a directory on the way to it.",
      }),
    };
  }
  if (relativePathWithin(packageRootIdentity, moduleIdentity) === null) {
    return {
      diagnostic: createDiagnostic({
        code: "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
        source,
        path: [...position, "specifier"],
        message:
          "The definition source resolves through a symlink that leaves the package root.",
        expected: "a real path contained by the package root",
        received: specifier,
        repair:
          "Replace the symlink with a module that really lives in this package.",
      }),
    };
  }
  return { source: { source, position, moduleIdentity } };
}

function duplicateDiagnostics(
  sources: readonly ResolvedDefinitionSource[],
): readonly DefinitionDiagnostic[] {
  const groups = new Map<string, ResolvedDefinitionSource[]>();
  for (const entry of sources) {
    const key = [
      entry.moduleIdentity,
      JSON.stringify(entry.source.exportPath ?? []),
    ].join(IDENTITY_SEPARATOR);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [entry]);
    else group.push(entry);
  }
  const diagnostics: DefinitionDiagnostic[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Every position is named, and each keeps the position its author wrote,
    // so the repair points at a config line rather than at a resolved path.
    const ordered = [...group].sort((left, right) => {
      const bySource = compareDefinitionSources(left.source, right.source);
      return bySource !== 0
        ? bySource
        : compareDefinitionPaths(left.position, right.position);
    });
    const [first, ...rest] = ordered;
    diagnostics.push(
      createDiagnostic({
        code: "PH-CONFIG-DUPLICATE-SOURCE",
        source: first.source,
        path: first.position,
        message:
          "Several entries select the same module and export path, so one of them can only repeat the other's definitions.",
        expected: "one entry per module and export path",
        received: `${ordered.length} entries`,
        repair: "Remove every duplicate entry except one.",
        related: rest.map((entry) => ({
          source: entry.source,
          path: entry.position,
          message: "This entry resolves to the same module and export path.",
        })),
      }),
    );
  }
  return diagnostics;
}

function failed(
  packageRoot: string,
  packageRootIdentity: string,
  diagnostics: readonly DefinitionDiagnostic[],
  origin: DefinitionSourceOrigin = "config",
  sources: readonly DefinitionSource[] = [],
  reason?: DefinitionSourceResolution["reason"],
): InternalResolution {
  return {
    status: "failed",
    packageRoot,
    packageRootIdentity,
    sourceSet: sourceSet("code-first", origin, sources),
    diagnostics: [...diagnostics].sort(compareDefinitionDiagnostics),
    resolved: [],
    ...(reason !== undefined && { reason }),
  };
}

const CONFIG_FAILURE_REPAIR: Record<ConfigFileError["reason"], string> = {
  missing:
    "Create the config file, or point --config-file at the package's existing one.",
  "read-failed": "Fix the permissions of the selected config file.",
  "parse-failed": "Repair the JSON in the selected config file.",
  "not-an-object": "Make the config file a single JSON object.",
};

function selectionDiagnostic(
  narrowed: Extract<
    ReturnType<typeof parseDefinitionSourcesConfig>,
    { ok: false }
  >,
): DefinitionDiagnostic {
  const code: DefinitionDiagnosticCode =
    narrowed.reason === "missing" || narrowed.reason === "empty"
      ? "PH-CONFIG-SOURCES-MISSING"
      : narrowed.reason === "unsupported-version"
        ? "PH-CONFIG-VERSION-UNSUPPORTED"
        : "PH-CONFIG-SOURCE-INVALID";
  switch (narrowed.reason) {
    case "missing":
      return createDiagnostic({
        code,
        path: narrowed.path,
        message:
          "This package has not declared definitionSources, so no command knows which modules declare its definitions.",
        expected:
          'formatVersion 1 with mode "code-first" and at least one entry, or mode "schema-first"',
        received: "no definitionSources field",
        repair:
          'Add "definitionSources": { "formatVersion": 1, "mode": "schema-first" } when this package authors no TypeScript definition, or list its roots under mode "code-first".',
      });
    case "empty":
      return createDiagnostic({
        code,
        path: narrowed.path,
        message:
          "Code-first mode selected an empty entry list, which would check nothing at all.",
        expected: "at least one definition source entry",
        received: "an empty entries array",
        repair:
          'List this package\'s definition roots, or declare mode "schema-first".',
      });
    case "unsupported-version":
      return createDiagnostic({
        code,
        path: narrowed.path,
        message:
          "The definitionSources format version is not one this release reads.",
        expected: "1",
        received: render(narrowed.received),
        repair: "Set definitionSources.formatVersion to 1, or upgrade ph.",
      });
    case "invalid":
      return createDiagnostic({
        code,
        path: narrowed.path,
        message: "The definitionSources selection is malformed.",
        expected: narrowed.expected,
        received: render(narrowed.received),
        repair: `Set this member to ${narrowed.expected}.`,
      });
  }
}

/**
 * Resolves the selection without importing anything.
 *
 * The config file has to exist and parse even when `--source` replaces its
 * entries, because its directory is what defines the package root.
 */
export function resolveDefinitionSources(
  request: DefinitionSourceSelectionRequest,
): InternalResolution {
  const configFile = resolve(request.configFile ?? CONFIG_FILE_NAME);
  const packageRoot = dirname(configFile);
  let packageRootIdentity = packageRoot;
  try {
    packageRootIdentity = realpathSync.native(packageRoot);
  } catch {
    // The strict read below produces the one deterministic diagnostic.
  }

  let definitionSources: unknown;
  try {
    definitionSources = getConfigStrict(configFile).definitionSources;
  } catch (error) {
    const reason =
      error instanceof ConfigFileError ? error.reason : "read-failed";
    return failed(packageRoot, packageRootIdentity, [
      createDiagnostic({
        code: "PH-CONFIG-SOURCE-INVALID",
        path: ["configFile"],
        message:
          "The selected Powerhouse config file could not be read; its directory is what defines the package root.",
        expected: "an existing config file holding one JSON object",
        received: reason,
        repair: CONFIG_FAILURE_REPAIR[reason],
      }),
    ]);
  }

  const cliSources = request.cliSources ?? [];
  let origin: DefinitionSourceOrigin;
  let entries: readonly unknown[];
  let entryPosition: (index: number) => DefinitionPath;

  if (cliSources.length > 0) {
    // A CLI list replaces the configured entries in full, and it replaces
    // them whatever the ignored field says — including a missing, malformed,
    // or unsupported one. Merging the two would make the effective selection
    // depend on a file the author was overriding on purpose.
    origin = "cli";
    entryPosition = (index) => ["sources", index];
    const parsed: unknown[] = [];
    const parseDiagnostics: DefinitionDiagnostic[] = [];
    cliSources.forEach((value, index) => {
      const option = parseDefinitionSourceOption(value);
      if (option.ok) {
        parsed.push(option.source);
        return;
      }
      parseDiagnostics.push(
        createDiagnostic({
          code: "PH-CONFIG-SOURCE-INVALID",
          path: entryPosition(index),
          message: option.message,
          expected: "'./module.ts' or './module.ts#/exportName'",
          received: render(value),
          repair:
            "Fix this --source value and quote it: an unquoted '#' starts a shell comment.",
        }),
      );
    });
    if (parseDiagnostics.length > 0) {
      return failed(packageRoot, packageRootIdentity, parseDiagnostics, origin);
    }
    entries = parsed;
  } else {
    origin = "config";
    entryPosition = (index) => ["definitionSources", "entries", index];
    const narrowed = parseDefinitionSourcesConfig(definitionSources);
    if (!narrowed.ok) {
      return failed(
        packageRoot,
        packageRootIdentity,
        [selectionDiagnostic(narrowed)],
        origin,
        [],
        narrowed.reason === "missing" ? "sources-undeclared" : undefined,
      );
    }
    if (narrowed.mode === "schema-first") {
      return {
        status: "skipped",
        packageRoot,
        packageRootIdentity,
        sourceSet: sourceSet("schema-first", "config", []),
        diagnostics: [],
        resolved: [],
      };
    }
    entries = narrowed.entries;
  }

  const normalized = entries.map((value, index) =>
    normalizeEntry(
      value,
      entryPosition(index),
      packageRoot,
      packageRootIdentity,
    ),
  );
  const entryDiagnostics = normalized.flatMap((result) =>
    "diagnostic" in result ? [result.diagnostic] : [],
  );
  // Ordering is by normalized specifier and export path, so config order, CLI
  // order, adapter choice, and machine root cannot change what a run produces.
  const resolved = normalized
    .flatMap((result) => ("source" in result ? [result.source] : []))
    .sort((left, right) => compareDefinitionSources(left.source, right.source));
  const sources = resolved.map((entry) => entry.source);

  if (entryDiagnostics.length > 0) {
    return failed(
      packageRoot,
      packageRootIdentity,
      entryDiagnostics,
      origin,
      sources,
    );
  }

  const duplicates = duplicateDiagnostics(resolved);
  return {
    status: duplicates.length === 0 ? "ready" : "failed",
    packageRoot,
    packageRootIdentity,
    sourceSet: sourceSet("code-first", origin, sources),
    diagnostics: [...duplicates].sort(compareDefinitionDiagnostics),
    resolved: duplicates.length === 0 ? resolved : [],
  };
}

/**
 * The selection a command would check, with no machine-specific member on it.
 *
 * Separate from importing, because `ph model inspect`, `ph build`, and the
 * publish gate all need to know what was selected before anything is
 * evaluated — and a caller outside this package must not be handed the
 * resolved real paths the loader dedupes on.
 */
export function resolveDefinitionSelection(
  request: DefinitionSourceSelectionRequest,
): DefinitionSourceResolution {
  return publicResolution(resolveDefinitionSources(request));
}

/** Drops the machine-specific members before a resolution reaches a report. */
export function publicResolution(
  value: InternalResolution,
): DefinitionSourceResolution {
  return {
    status: value.status,
    packageRoot: value.packageRoot,
    sourceSet: value.sourceSet,
    diagnostics: value.diagnostics,
    ...(value.reason !== undefined && { reason: value.reason }),
  };
}
