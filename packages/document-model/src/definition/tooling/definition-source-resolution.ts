import {
  COMMONJS_DEFINITION_SOURCE,
  COMMONJS_DEFINITION_SOURCE_REPAIR,
  DEFINITION_SOURCE_EXTENSION,
} from "@powerhousedao/shared/clis/definition-sources";
import type {
  DefinitionDiagnostic,
  DefinitionPath,
  DefinitionSource,
} from "@powerhousedao/shared/document-model";
import {
  pathWithin,
  realPathThroughExistingParent,
} from "@powerhousedao/shared/clis/real-paths";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import {
  compareDefinitionPaths,
  sortDefinitionDiagnostics,
} from "../kernel/diagnostics.js";
import {
  canonicalDigest,
  compareCodeUnits,
  isNFC,
} from "../kernel/primitives.js";
import type {
  DefinitionSourceOrigin,
  DefinitionSourceResolution,
  DefinitionSourceSelectionRequest,
  DefinitionSourceSet,
} from "./definition-source-types.js";
import { toolingDiagnostics } from "./diagnostic-codes.js";
import {
  discoverDocumentModelDirectories,
  type DocumentModelDirectory,
  packageSpecifier,
  resolveDocumentModelsDir,
} from "./model-directories.js";

export type ResolvedDefinitionSource = {
  readonly source: DefinitionSource;

  readonly position: DefinitionPath;

  readonly moduleIdentity: string;
};

export type InternalResolution = DefinitionSourceResolution & {
  readonly packageRootIdentity: string;
  readonly resolved: readonly ResolvedDefinitionSource[];
};

/** What discovery read besides the sources it resolved. */
export type DiscoveryResolution = InternalResolution & {
  /** Absolute; absent when the configured directory cannot be read. */
  readonly documentModelsDir?: string;
  readonly directories: readonly DocumentModelDirectory[];
};

const CONFIG_FILE_NAME = "./powerhouse.config.json";

const IDENTITY_SEPARATOR = String.fromCharCode(0);

function render(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  try {
    // `JSON.stringify` returns `undefined` for a function or a symbol.
    const json = JSON.stringify(value) as string | undefined;
    return json ?? typeof value;
  } catch {
    return typeof value;
  }
}

function sourceSet(
  origin: DefinitionSourceOrigin,
  documentModelsDir: `./${string}`,
  sources: readonly DefinitionSource[],
  stored: readonly DefinitionSource[] = [],
): DefinitionSourceSet {
  const value = { origin, documentModelsDir, sources, stored };
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
  for (
    let index = 0;
    index < Math.min(leftPath.length, rightPath.length);
    index += 1
  ) {
    const segment = compareCodeUnits(leftPath[index], rightPath[index]);
    if (segment !== 0) return segment;
  }
  return leftPath.length - rightPath.length;
}

function isCanonicalText(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      return false;
    }
  }
  return isNFC(value);
}

type SpecifierResult =
  | { readonly ok: true; readonly specifier: `./${string}` }
  | {
      readonly ok: false;
      readonly code:
        | "PH-CONFIG-SOURCE-INVALID"
        | "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE";
      readonly message: string;
      readonly expected?: string;
      readonly repair?: string;
    };

export function normalizeSpecifier(value: string): SpecifierResult {
  if (
    !value.startsWith("./") ||
    /[\\#?]/.test(value) ||
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
  if (normalized === "." || normalized === "./") {
    return {
      ok: false,
      code: "PH-CONFIG-SOURCE-INVALID",
      message: "A definition source names a module file, not the package root.",
    };
  }
  if (normalized === ".." || normalized.startsWith("../")) {
    return {
      ok: false,
      code: "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
      message: "The normalized definition source path leaves the package root.",
    };
  }
  if (COMMONJS_DEFINITION_SOURCE.test(value)) {
    return {
      ok: false,
      code: "PH-CONFIG-SOURCE-INVALID",
      message:
        "A definition source is evaluated as an ES module, so a CommonJS module cannot be one.",
      expected: "a .ts, .mts, .tsx, .js, .mjs or .jsx module",
      repair: COMMONJS_DEFINITION_SOURCE_REPAIR,
    };
  }
  if (!DEFINITION_SOURCE_EXTENSION.test(value)) {
    return {
      ok: false,
      code: "PH-CONFIG-SOURCE-INVALID",
      message:
        "A definition source names a JavaScript or TypeScript module file with its extension.",
    };
  }
  return { ok: true, specifier: `./${normalized}` };
}

/** Where a lexically contained module really lives, unless a symlink takes it out of the package. */
export function realModulePath(
  packageRoot: string,
  packageRootIdentity: string,
  specifier: `./${string}`,
):
  | { readonly ok: true; readonly moduleIdentity: string }
  | { readonly ok: false; readonly reason: "unresolvable" | "outside" } {
  let moduleIdentity: string;
  try {
    moduleIdentity = realPathThroughExistingParent(
      resolve(packageRoot, ...specifier.slice(2).split("/")),
    );
  } catch {
    return { ok: false, reason: "unresolvable" };
  }
  return pathWithin(packageRootIdentity, moduleIdentity) !== null
    ? { ok: true, moduleIdentity }
    : { ok: false, reason: "outside" };
}

type EntryResult =
  | { readonly source: ResolvedDefinitionSource }
  | { readonly diagnostic: DefinitionDiagnostic };

function invalidEntry(
  path: DefinitionPath,
  message: string,
  expected: string,
  received: string,
  repair: string,
  source?: DefinitionSource,
): EntryResult {
  return {
    diagnostic: toolingDiagnostics.create({
      code: "PH-CONFIG-SOURCE-INVALID",
      ...(source !== undefined && { source }),
      path,
      message,
      expected,
      received,
      repair,
    }),
  };
}

function normalizeEntry(
  value: unknown,
  position: DefinitionPath,
  packageRoot: string,
  packageRootIdentity: string,
): EntryResult {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return invalidEntry(
      position,
      "A definition source entry must be a plain object.",
      "{ specifier, exportPath? }",
      render(value),
      'Replace this entry with { "specifier": "./src/<module>.ts" }.',
    );
  }
  const entry = value as Record<string, unknown>;
  const extra = Object.keys(entry)
    .filter((key) => key !== "specifier" && key !== "exportPath")
    .sort(compareCodeUnits);
  if (extra.length > 0) {
    return invalidEntry(
      position,
      "A definition source entry carries unsupported properties.",
      "specifier and optional exportPath",
      extra.join(", "),
      `Remove ${extra.join(", ")} from this entry.`,
    );
  }
  const specifierPath = [...position, "specifier"];
  if (typeof entry.specifier !== "string") {
    return invalidEntry(
      specifierPath,
      "A definition source specifier must be a string.",
      "a './' POSIX package-relative path",
      render(entry.specifier),
      "Set specifier to the package-relative TypeScript module path.",
    );
  }
  const normalized = normalizeSpecifier(entry.specifier);
  if (!normalized.ok) {
    return {
      diagnostic: toolingDiagnostics.create({
        code: normalized.code,
        path: specifierPath,
        message: normalized.message,
        expected:
          normalized.expected ??
          "a './' path contained by the selected package root",
        received: entry.specifier,
        repair:
          normalized.repair ??
          "Move the module inside the package and spell its path relative to the config file.",
      }),
    };
  }
  const { specifier } = normalized;

  let exportPath: readonly string[] | undefined;
  if (entry.exportPath !== undefined) {
    const valid =
      Array.isArray(entry.exportPath) &&
      entry.exportPath.every(
        (segment) => typeof segment === "string" && isCanonicalText(segment),
      );
    if (!valid) {
      return invalidEntry(
        [...position, "exportPath"],
        "An exportPath is an array of exact property keys in NFC, without control characters.",
        "an array of property-key strings",
        render(entry.exportPath),
        "Replace exportPath with the exported property keys, outermost first.",
        { specifier },
      );
    }
    const segments = entry.exportPath as readonly string[];
    if (segments.length > 0) exportPath = [...segments];
  }

  const source: DefinitionSource =
    exportPath === undefined ? { specifier } : { specifier, exportPath };
  const real = realModulePath(packageRoot, packageRootIdentity, specifier);
  if (!real.ok && real.reason === "unresolvable") {
    return invalidEntry(
      specifierPath,
      "The definition source path could not be resolved.",
      "a resolvable path inside the package root",
      specifier,
      "Fix the path, or the permissions of a directory on the way to it.",
      source,
    );
  }
  if (!real.ok) {
    return {
      diagnostic: toolingDiagnostics.create({
        code: "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
        source,
        path: specifierPath,
        message:
          "The definition source resolves through a symlink that leaves the package root.",
        expected: "a real path contained by the package root",
        received: specifier,
        repair:
          "Replace the symlink with a module that really lives in this package.",
      }),
    };
  }
  return { source: { source, position, moduleIdentity: real.moduleIdentity } };
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
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => {
      const [first, ...rest] = [...group].sort(
        (left, right) =>
          compareDefinitionSources(left.source, right.source) ||
          compareDefinitionPaths(left.position, right.position),
      );
      return toolingDiagnostics.create({
        code: "PH-CONFIG-DUPLICATE-SOURCE",
        source: first.source,
        path: first.position,
        message:
          "Several sources reach the same module and export path, so one of them can only repeat the other's definitions. A model directory symlinked to another is one of them.",
        expected: "one source per module and export path",
        received: `${group.length} sources`,
        repair:
          "Remove every duplicate except one, or replace a symlinked model directory with the directory itself.",
        related: rest.map((entry) => ({
          source: entry.source,
          path: entry.position,
          message: "This source resolves to the same module and export path.",
        })),
      });
    });
}

type Roots = {
  readonly packageRoot: string;
  readonly packageRootIdentity: string;
};

type ConfigReadFailure =
  | "missing"
  | "read-failed"
  | "parse-failed"
  | "not-an-object";

const CONFIG_FAILURE_REPAIR: Record<ConfigReadFailure, string> = {
  missing:
    "Create the config file, or point --config-file at the package's existing one.",
  "read-failed": "Fix the permissions of the selected config file.",
  "parse-failed": "Repair the JSON in the selected config file.",
  "not-an-object": "Make the config file a single JSON object.",
};

export function readConfigObject(
  configFile: string,
):
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly reason: ConfigReadFailure } {
  let text: string;
  try {
    text = readFileSync(configFile, "utf8");
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    return {
      ok: false,
      reason:
        code === "ENOENT" || code === "ENOTDIR" ? "missing" : "read-failed",
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "parse-failed" };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "not-an-object" };
  }
  return { ok: true, value: parsed as Readonly<Record<string, unknown>> };
}

/** The selected config file, its directory, and that directory's real path when it exists. */
export function packageRoots(request: DefinitionSourceSelectionRequest): {
  readonly configFile: string;
  readonly packageRoot: string;
  readonly packageRootIdentity: string;
} {
  const configFile = resolve(request.configFile ?? CONFIG_FILE_NAME);
  const packageRoot = dirname(configFile);
  try {
    const packageRootIdentity = realpathSync.native(packageRoot);
    return { configFile, packageRoot, packageRootIdentity };
  } catch {
    // Reading the config reports the missing directory.
    return { configFile, packageRoot, packageRootIdentity: packageRoot };
  }
}

type ResolutionBase = Roots & {
  readonly documentModelsDir: `./${string}`;
  readonly documentModelsPath?: string;
  readonly diagnostics: readonly DefinitionDiagnostic[];
};

function readPackage(
  request: DefinitionSourceSelectionRequest,
): ResolutionBase & { readonly ok: boolean } {
  const { configFile, ...roots } = packageRoots(request);
  const fallback = {
    ...roots,
    documentModelsDir: "./document-models" as const,
  };
  let config: Readonly<Record<string, unknown>> = {};
  if (request.allowMissingConfig !== true || existsSync(configFile)) {
    const read = readConfigObject(configFile);
    if (!read.ok) {
      return {
        ...fallback,
        ok: false,
        diagnostics: [
          toolingDiagnostics.create({
            code: "PH-CONFIG-SOURCE-INVALID",
            path: ["configFile"],
            message:
              "The selected Powerhouse config file could not be read; its directory is the package root.",
            expected: "an existing config file holding one JSON object",
            received: read.reason,
            repair: CONFIG_FAILURE_REPAIR[read.reason],
          }),
        ],
      };
    }
    config = read.value;
  }
  const directory = resolveDocumentModelsDir(roots.packageRoot, config);
  if (!directory.ok) {
    return { ...fallback, ok: false, diagnostics: [directory.diagnostic] };
  }
  return {
    ...roots,
    ok: true,
    documentModelsDir: packageSpecifier(roots.packageRoot, directory.path),
    documentModelsPath: directory.path,
    diagnostics: [],
  };
}

function failed(
  base: ResolutionBase,
  origin: DefinitionSourceOrigin,
  diagnostics: readonly DefinitionDiagnostic[],
  sources: readonly DefinitionSource[] = [],
  stored: readonly DefinitionSource[] = [],
): InternalResolution {
  return {
    packageRoot: base.packageRoot,
    packageRootIdentity: base.packageRootIdentity,
    status: "failed",
    sourceSet: sourceSet(origin, base.documentModelsDir, sources, stored),
    diagnostics: sortDefinitionDiagnostics(diagnostics),
    resolved: [],
  };
}

function resolveSources(
  base: ResolutionBase,
  origin: DefinitionSourceOrigin,
  entries: readonly {
    readonly value: unknown;
    readonly position: DefinitionPath;
  }[],
  stored: readonly DefinitionSource[],
  diagnostics: readonly DefinitionDiagnostic[],
): InternalResolution {
  const normalized = entries.map(({ value, position }) =>
    normalizeEntry(value, position, base.packageRoot, base.packageRootIdentity),
  );
  const candidates = normalized
    .flatMap((result) => ("source" in result ? [result.source] : []))
    .sort((left, right) => compareDefinitionSources(left.source, right.source));
  const resolved =
    origin === "discovery"
      ? candidates.filter(
          (entry, index) =>
            candidates.findIndex(
              (other) => other.moduleIdentity === entry.moduleIdentity,
            ) === index,
        )
      : candidates;
  const sources = resolved.map((entry) => entry.source);
  const errors = [
    ...normalized.flatMap((result) =>
      "diagnostic" in result ? [result.diagnostic] : [],
    ),
    ...duplicateDiagnostics(resolved),
  ];
  if (
    errors.length > 0 ||
    diagnostics.some(({ severity }) => severity === "error")
  ) {
    return failed(base, origin, [...diagnostics, ...errors], sources, stored);
  }
  const common = {
    packageRoot: base.packageRoot,
    packageRootIdentity: base.packageRootIdentity,
    sourceSet: sourceSet(origin, base.documentModelsDir, sources, stored),
    diagnostics: sortDefinitionDiagnostics(diagnostics),
  };
  return sources.length === 0
    ? {
        ...common,
        status: "skipped",
        skipReason: "no-document-models",
        resolved: [],
      }
    : { ...common, status: "ready", resolved };
}

/**
 * Discovers the package's model directories: each code-first directory's
 * entry module becomes a source, each schema-first one's stored file is
 * listed beside them. Nothing is imported.
 */
export function resolveDefinitionSources(
  request: DefinitionSourceSelectionRequest,
): DiscoveryResolution {
  const base = readPackage(request);
  if (!base.ok || base.documentModelsPath === undefined) {
    return {
      ...failed(base, "discovery", base.diagnostics),
      directories: [],
    };
  }
  const found = discoverDocumentModelDirectories(
    base.packageRoot,
    base.documentModelsPath,
  );
  const entries = found.directories.flatMap((directory) =>
    directory.kind === "module"
      ? [{ value: { specifier: directory.entry }, position: [] }]
      : [],
  );
  const stored = found.directories.flatMap((directory) =>
    directory.kind === "stored" ? [{ specifier: directory.specification }] : [],
  );
  return {
    ...resolveSources(base, "discovery", entries, stored, found.diagnostics),
    documentModelsDir: base.documentModelsPath,
    directories: found.directories,
  };
}

/**
 * @experimental Resolves sources a caller names instead of discovering them.
 */
export function resolveRequestedSources(
  request: DefinitionSourceSelectionRequest & {
    readonly sources: readonly unknown[];
  },
): InternalResolution {
  const base = readPackage(request);
  if (!base.ok) return failed(base, "request", base.diagnostics);
  return resolveSources(
    base,
    "request",
    request.sources.map((value, index) => ({
      value,
      position: ["sources", index],
    })),
    [],
    [],
  );
}

export function publicResolution(
  value: InternalResolution,
): DefinitionSourceResolution {
  const common = {
    packageRoot: value.packageRoot,
    sourceSet: value.sourceSet,
    diagnostics: value.diagnostics,
  };
  return value.status === "skipped"
    ? { ...common, status: "skipped", skipReason: value.skipReason }
    : { ...common, status: value.status };
}

/**
 * @experimental The sources discovery finds, resolved without importing
 * anything and without any machine-specific path but the root.
 */
export function resolveDefinitionSelection(
  request: DefinitionSourceSelectionRequest,
): DefinitionSourceResolution {
  return publicResolution(resolveDefinitionSources(request));
}
