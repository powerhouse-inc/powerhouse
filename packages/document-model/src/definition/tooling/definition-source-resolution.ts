import {
  DEFAULT_AUTHORING_MODE,
  parseDefinitionSourcesConfig,
} from "@powerhousedao/shared/clis/definition-sources";
import type {
  DefinitionCheckSkipReason,
  DefinitionDiagnostic,
  DefinitionPath,
  DefinitionSource,
} from "@powerhousedao/shared/document-model";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";
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

export type ResolvedDefinitionSource = {
  readonly source: DefinitionSource;

  readonly position: DefinitionPath;

  readonly moduleIdentity: string;
};

export type InternalResolution = DefinitionSourceResolution & {
  readonly packageRootIdentity: string;
  readonly resolved: readonly ResolvedDefinitionSource[];
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

function isWithin(root: string, path: string): boolean {
  const child = relative(root, path);
  return child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
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

function normalizeSpecifier(value: string): SpecifierResult {
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
  if (!/\.(?:[cm]?[jt]s|[jt]sx)$/.test(value)) {
    return {
      ok: false,
      code: "PH-CONFIG-SOURCE-INVALID",
      message:
        "A definition source names a JavaScript or TypeScript module file with its extension.",
    };
  }
  return { ok: true, specifier: `./${normalized}` };
}

/**
 * Resolves symlinks as far as the path exists, so a source that is not
 * written yet is still judged against the real package root.
 */
function realPathThroughExistingParent(path: string): string {
  let current = path;
  const suffix: string[] = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return path;
    suffix.unshift(relative(parent, current));
    current = parent;
  }
  return resolve(realpathSync.native(current), ...suffix);
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
  const declaredPath = resolve(packageRoot, ...specifier.slice(2).split("/"));
  let moduleIdentity: string;
  try {
    moduleIdentity = realPathThroughExistingParent(declaredPath);
  } catch {
    return invalidEntry(
      specifierPath,
      "The definition source path could not be resolved.",
      "a resolvable path inside the package root",
      specifier,
      "Fix the path, or the permissions of a directory on the way to it.",
      source,
    );
  }
  if (!isWithin(packageRootIdentity, moduleIdentity)) {
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
          "Several entries select the same module and export path, so one of them can only repeat the other's definitions.",
        expected: "one entry per module and export path",
        received: `${group.length} entries`,
        repair: "Remove every duplicate entry except one.",
        related: rest.map((entry) => ({
          source: entry.source,
          path: entry.position,
          message: "This entry resolves to the same module and export path.",
        })),
      });
    });
}

type Roots = {
  readonly packageRoot: string;
  readonly packageRootIdentity: string;
};

function failed(
  roots: Roots,
  diagnostics: readonly DefinitionDiagnostic[],
  origin: DefinitionSourceOrigin = "config",
  sources: readonly DefinitionSource[] = [],
): InternalResolution {
  return {
    ...roots,
    status: "failed",
    sourceSet: sourceSet("code-first", origin, sources),
    diagnostics: sortDefinitionDiagnostics(diagnostics),
    resolved: [],
  };
}

function skipped(
  roots: Roots,
  skipReason: DefinitionCheckSkipReason,
  mode: DefinitionSourceSet["mode"],
): InternalResolution {
  return {
    ...roots,
    status: "skipped",
    skipReason,
    sourceSet: sourceSet(mode, "config", []),
    diagnostics: [],
    resolved: [],
  };
}

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

function readConfigObject(
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

function selectionDiagnostic(
  narrowed: Exclude<
    ReturnType<typeof parseDefinitionSourcesConfig>,
    { ok: true } | { reason: "missing" }
  >,
): DefinitionDiagnostic {
  if (narrowed.reason === "unsupported-version") {
    return toolingDiagnostics.create({
      code: "PH-CONFIG-VERSION-UNSUPPORTED",
      path: narrowed.path,
      message:
        "The definitionSources format version is not one this release reads.",
      expected: "1",
      received: render(narrowed.received),
      repair: "Set definitionSources.formatVersion to 1, or upgrade ph.",
    });
  }
  return toolingDiagnostics.create({
    code: "PH-CONFIG-SOURCE-INVALID",
    path: narrowed.path,
    message: "The definitionSources selection is malformed.",
    expected: narrowed.expected,
    received: render(narrowed.received),
    repair: `Set this member to ${narrowed.expected}.`,
  });
}

export function resolveDefinitionSources(
  request: DefinitionSourceSelectionRequest,
): InternalResolution {
  const configFile = resolve(request.configFile ?? CONFIG_FILE_NAME);
  const packageRoot = dirname(configFile);
  let packageRootIdentity = packageRoot;
  try {
    packageRootIdentity = realpathSync.native(packageRoot);
  } catch {
    // The config read below reports the missing directory.
  }
  const roots = { packageRoot, packageRootIdentity };

  if (request.allowMissingConfig === true && !existsSync(configFile)) {
    return skipped(roots, "definition-sources-absent", DEFAULT_AUTHORING_MODE);
  }

  const config = readConfigObject(configFile);
  if (!config.ok) {
    return failed(roots, [
      toolingDiagnostics.create({
        code: "PH-CONFIG-SOURCE-INVALID",
        path: ["configFile"],
        message:
          "The selected Powerhouse config file could not be read; its directory is the package root.",
        expected: "an existing config file holding one JSON object",
        received: config.reason,
        repair: CONFIG_FAILURE_REPAIR[config.reason],
      }),
    ]);
  }

  const origin = "config";
  const narrowed = parseDefinitionSourcesConfig(config.value.definitionSources);
  if (!narrowed.ok) {
    return narrowed.reason === "missing"
      ? skipped(roots, "definition-sources-absent", DEFAULT_AUTHORING_MODE)
      : failed(roots, [selectionDiagnostic(narrowed)], origin);
  }
  if (narrowed.mode === "schema-first") {
    return skipped(roots, "explicit-schema-first-mode", "schema-first");
  }
  if (narrowed.entries.length === 0) {
    return skipped(roots, "definition-sources-empty", "code-first");
  }
  const entries = narrowed.entries;

  const normalized = entries.map((value, index) =>
    normalizeEntry(
      value,
      ["definitionSources", "entries", index],
      packageRoot,
      packageRootIdentity,
    ),
  );

  const resolved = normalized
    .flatMap((result) => ("source" in result ? [result.source] : []))
    .sort((left, right) => compareDefinitionSources(left.source, right.source));
  const sources = resolved.map((entry) => entry.source);
  const entryDiagnostics = normalized.flatMap((result) =>
    "diagnostic" in result ? [result.diagnostic] : [],
  );
  if (entryDiagnostics.length > 0) {
    return failed(roots, entryDiagnostics, origin, sources);
  }
  const duplicates = duplicateDiagnostics(resolved);
  if (duplicates.length > 0) {
    return failed(roots, duplicates, origin, sources);
  }
  return {
    ...roots,
    status: "ready",
    sourceSet: sourceSet("code-first", origin, sources),
    diagnostics: [],
    resolved,
  };
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
 * @experimental The selection a command would load, resolved without
 * importing anything and without any machine-specific path but the root.
 */
export function resolveDefinitionSelection(
  request: DefinitionSourceSelectionRequest,
): DefinitionSourceResolution {
  return publicResolution(resolveDefinitionSources(request));
}
