import type {
  DefinitionSource,
  PowerhouseConfig,
} from "@powerhousedao/shared/clis";
import {
  ConfigFileError,
  getConfigStrict,
} from "@powerhousedao/shared/clis/config-strict";
import { existsSync, realpathSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { posix } from "node:path";
import {
  capCodePoints,
  compareDefinitionDiagnostics,
  compareDefinitionPaths,
  compareDefinitionSources,
} from "../definition/diagnostics.js";
import {
  snapshotDataArray,
  snapshotDataRecord,
} from "../definition/data-properties.js";
import {
  canonicalJsonFromUnknown,
  compareCodeUnits,
  isSha256Digest,
  isRecord,
  sha256,
} from "../definition/primitives.js";
import { relativePathWithin } from "./file-path.js";
import type {
  DefinitionSourceDiagnostic,
  DefinitionSourceLoadRequest,
  DefinitionSourceLoadResult,
  DefinitionSourceResolution,
  DefinitionSourceSelectionRequest,
  DefinitionSourceSet,
  LoadedDefinitionSource,
  TypeScriptSourceImportInterface,
} from "./types.js";

type SourcePosition = {
  readonly path: readonly (string | number)[];
};

type InternalSource = {
  readonly source: DefinitionSource;
  readonly position: SourcePosition;
  readonly moduleIdentity: string;
};

type InternalResolution = DefinitionSourceResolution & {
  readonly packageRoot: string;
  readonly packageRootIdentity: string;
  readonly internalSources: readonly InternalSource[];
};

const ALLOWED_SOURCE_KEYS = new Set(["specifier", "exportPath"]);

class SourceSpecifierError extends Error {
  readonly code:
    | "PH-CONFIG-SOURCE-INVALID"
    | "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE";

  constructor(
    code: "PH-CONFIG-SOURCE-INVALID" | "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

const canonicalJson = canonicalJsonFromUnknown;

function sourceSet(
  mode: DefinitionSourceSet["mode"],
  origin: DefinitionSourceSet["origin"],
  sources: readonly DefinitionSource[],
): DefinitionSourceSet {
  const value = { mode, origin, sources };
  return { ...value, digest: sha256(canonicalJson(value)) };
}

function summary(value: unknown): string {
  if (typeof value === "string") return capCodePoints(value);
  try {
    return capCodePoints(canonicalJson(value));
  } catch {
    try {
      return capCodePoints(String(value));
    } catch {
      return typeof value;
    }
  }
}

function errorKind(error: unknown): string {
  try {
    if (error instanceof Error) return "Error";
  } catch {
    // Revoked Proxies and hostile Symbol.hasInstance hooks are untrusted input.
  }
  if (error === null) return "null";
  return typeof error;
}

type DiagnosticInput = Omit<
  DefinitionSourceDiagnostic,
  "severity" | "expected" | "received"
> & {
  readonly expected?: unknown;
  readonly received?: unknown;
};

function diagnostic(input: DiagnosticInput): DefinitionSourceDiagnostic {
  return {
    ...input,
    severity: "error",
    expected:
      input.expected === undefined ? undefined : summary(input.expected),
    received:
      input.received === undefined ? undefined : summary(input.received),
  };
}

function compareSources(
  left: DefinitionSource,
  right: DefinitionSource,
): number {
  return compareDefinitionSources(left, right);
}

function diagnosticRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  const inspected = snapshotDataRecord(value, {
    allowCustomPrototype: true,
    ignoreNonEnumerable: true,
  });
  if (!inspected.ok) return undefined;
  if (typeof inspected.value.message === "string") return inspected.value;
  let message: PropertyDescriptor | undefined;
  try {
    message = Object.getOwnPropertyDescriptor(value, "message");
  } catch {
    return undefined;
  }
  return message && "value" in message && typeof message.value === "string"
    ? Object.freeze({ ...inspected.value, message: message.value })
    : inspected.value;
}

function definitionDiagnosticsFromError(
  error: unknown,
  source: DefinitionSource,
): readonly DefinitionSourceDiagnostic[] | undefined {
  try {
    const inspectedError = diagnosticRecord(error);
    if (!inspectedError) return undefined;
    const errorDiagnostics = inspectedError.diagnostics;
    const inspectedDiagnostics = snapshotDataArray(errorDiagnostics);
    const candidates = inspectedDiagnostics.ok
      ? inspectedDiagnostics.value
      : [inspectedError];
    if (candidates.length === 0) return undefined;
    const result: DefinitionSourceDiagnostic[] = [];
    for (const candidateValue of candidates) {
      const candidate = diagnosticRecord(candidateValue);
      if (!candidate) return undefined;
      const code = candidate.code;
      const message = candidate.message;
      const repair = candidate.repair;
      const inspectedPath = snapshotDataArray(candidate.path);
      const phaseValue = candidate.phase;
      const severity = candidate.severity;
      const expected = candidate.expected;
      const received = candidate.received;
      const definitionValue = candidate.definition;
      if (
        typeof code !== "string" ||
        !/^PH-[A-Z0-9-]+$/.test(code) ||
        typeof message !== "string" ||
        typeof repair !== "string" ||
        !inspectedPath.ok ||
        !inspectedPath.value.every(
          (segment) =>
            typeof segment === "string" ||
            (typeof segment === "number" &&
              Number.isSafeInteger(segment) &&
              segment >= 0),
        )
      ) {
        return undefined;
      }
      if (
        (phaseValue !== undefined && typeof phaseValue !== "string") ||
        (severity !== undefined &&
          severity !== "error" &&
          severity !== "warning") ||
        (expected !== undefined && typeof expected !== "string") ||
        (received !== undefined && typeof received !== "string")
      ) {
        return undefined;
      }
      const phase = phaseValue ?? "definition";
      if (
        ![
          "configuration",
          "import",
          "definition",
          "composition",
          "authorization",
          "typecheck",
          "package",
          "replay",
        ].includes(phase)
      ) {
        return undefined;
      }
      let definition: DefinitionSourceDiagnostic["definition"] | undefined;
      if (definitionValue !== undefined) {
        const inspectedDefinition = snapshotDataRecord(definitionValue);
        if (!inspectedDefinition.ok) return undefined;
        const kind = inspectedDefinition.value.kind;
        const key = inspectedDefinition.value.key;
        const version = inspectedDefinition.value.version;
        if (
          !["document-model", "subgraph", "scalar", "package"].includes(
            kind as string,
          ) ||
          typeof key !== "string" ||
          key.length === 0 ||
          (version !== undefined &&
            (typeof version !== "number" ||
              !Number.isSafeInteger(version) ||
              version <= 0))
        ) {
          return undefined;
        }
        definition = {
          kind: kind as NonNullable<
            DefinitionSourceDiagnostic["definition"]
          >["kind"],
          key,
          ...(version === undefined ? {} : { version }),
        };
      }
      result.push({
        code: code as `PH-${string}`,
        severity: severity === "warning" ? "warning" : "error",
        phase: phase as DefinitionSourceDiagnostic["phase"],
        source,
        ...(definition ? { definition } : {}),
        path: [...(inspectedPath.value as (string | number)[])],
        message: capCodePoints(message),
        ...(expected === undefined
          ? {}
          : { expected: capCodePoints(expected as string) }),
        ...(received === undefined
          ? {}
          : { received: capCodePoints(received as string) }),
        repair: capCodePoints(repair),
      });
    }
    return result;
  } catch {
    return undefined;
  }
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    (value as unknown[]).every((segment) => typeof segment === "string")
  );
}

function isCanonicalSourceText(value: string): boolean {
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

function isCanonicalExportPath(value: unknown): value is string[] {
  return (
    isStringArray(value) &&
    value.every((segment) => isCanonicalSourceText(segment))
  );
}

function resolveThroughExistingParent(path: string): string {
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

function decodeJsonPointer(fragment: string): readonly string[] {
  let decoded: string;
  try {
    decoded = decodeURIComponent(fragment);
  } catch {
    throw new Error("The export fragment is not valid percent-encoded text.");
  }

  if (decoded === "") return [];
  if (!decoded.startsWith("/")) {
    throw new Error("The export fragment must be empty or start with '/'.");
  }

  return decoded
    .slice(1)
    .split("/")
    .map((segment) => {
      if (/~(?:[^01]|$)/.test(segment)) {
        throw new Error("The export fragment contains an invalid '~' escape.");
      }
      return segment.replaceAll("~1", "/").replaceAll("~0", "~");
    });
}

function parseCliSource(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const fragmentIndex = value.indexOf("#");
  if (fragmentIndex < 0) return { specifier: value };

  const specifier = value.slice(0, fragmentIndex);
  const fragment = value.slice(fragmentIndex + 1);
  const exportPath = decodeJsonPointer(fragment);
  return exportPath.length === 0 ? { specifier } : { specifier, exportPath };
}

export function normalizeDefinitionSourceSpecifier(
  value: string,
): `./${string}` {
  if (
    !value.startsWith("./") ||
    value.includes("\\") ||
    !isCanonicalSourceText(value) ||
    value.includes("#") ||
    value.includes("?")
  ) {
    throw new SourceSpecifierError(
      "PH-CONFIG-SOURCE-INVALID",
      "The source must use a ./ POSIX package-relative path.",
    );
  }

  const path = posix.normalize(value.slice(2));
  if (path === ".") {
    throw new SourceSpecifierError(
      "PH-CONFIG-SOURCE-INVALID",
      "The source must name a file rather than the package root.",
    );
  }
  if (path === ".." || path.startsWith("../") || posix.isAbsolute(path)) {
    throw new SourceSpecifierError(
      "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
      "The normalized source path leaves the package root.",
    );
  }
  return `./${path}`;
}

/** Checks the closed, normalized shape persisted in definition source sets. */
export function isCanonicalDefinitionSource(
  value: unknown,
): value is DefinitionSource {
  try {
    if (!isRecord(value) || typeof value.specifier !== "string") return false;
    if (
      Reflect.ownKeys(value).some(
        (key) => typeof key !== "string" || !ALLOWED_SOURCE_KEYS.has(key),
      )
    ) {
      return false;
    }
    if (
      normalizeDefinitionSourceSpecifier(value.specifier) !== value.specifier
    ) {
      return false;
    }
    return (
      value.exportPath === undefined || isCanonicalExportPath(value.exportPath)
    );
  } catch {
    return false;
  }
}

function missingExportDiagnostic(
  source: DefinitionSource,
  index: number,
  key: string,
): DefinitionSourceDiagnostic {
  return diagnostic({
    code: "PH-CONFIG-SOURCE-INVALID",
    phase: "configuration",
    source,
    path: ["exportPath", index],
    message:
      "The configured export path does not exist in the imported namespace.",
    expected: key,
    received: "missing",
    repair: "Update the export pointer to an exact exported property path.",
  });
}

function normalizeSource(
  value: unknown,
  position: SourcePosition,
  packageRoot: string,
  packageRootIdentity: string,
): { source?: InternalSource; diagnostic?: DefinitionSourceDiagnostic } {
  if (!isRecord(value)) {
    return {
      diagnostic: diagnostic({
        code: "PH-CONFIG-SOURCE-INVALID",
        phase: "configuration",
        path: position.path,
        message: "A definition source entry must be an object.",
        expected: "an object with specifier and optional exportPath",
        received: value,
        repair: "Replace this entry with a package-relative definition source.",
      }),
    };
  }

  const extraKeys = Object.keys(value).filter(
    (key) => !ALLOWED_SOURCE_KEYS.has(key),
  );
  if (extraKeys.length > 0) {
    return {
      diagnostic: diagnostic({
        code: "PH-CONFIG-SOURCE-INVALID",
        phase: "configuration",
        path: position.path,
        message: "A definition source entry contains unsupported properties.",
        expected: "specifier and optional exportPath",
        received: extraKeys.sort(compareCodeUnits),
        repair: "Remove the unsupported properties from this source entry.",
      }),
    };
  }

  if (typeof value.specifier !== "string") {
    return {
      diagnostic: diagnostic({
        code: "PH-CONFIG-SOURCE-INVALID",
        phase: "configuration",
        path: [...position.path, "specifier"],
        message: "A definition source specifier must be a string.",
        expected: "a ./ POSIX package-relative path",
        received: value.specifier,
        repair: "Set specifier to the package-relative TypeScript module path.",
      }),
    };
  }

  let specifier: `./${string}`;
  try {
    specifier = normalizeDefinitionSourceSpecifier(value.specifier);
  } catch (error) {
    const sourceError =
      error instanceof SourceSpecifierError
        ? error
        : new SourceSpecifierError(
            "PH-CONFIG-SOURCE-INVALID",
            "The source specifier is invalid.",
          );
    return {
      diagnostic: diagnostic({
        code: sourceError.code,
        phase: "configuration",
        path: [...position.path, "specifier"],
        message: sourceError.message,
        expected: "a ./ POSIX package-relative path",
        received: value.specifier,
        repair: "Use a ./ path that stays inside the package root.",
      }),
    };
  }

  let exportPath: readonly string[] | undefined;
  if (value.exportPath !== undefined) {
    if (!isCanonicalExportPath(value.exportPath)) {
      return {
        diagnostic: diagnostic({
          code: "PH-CONFIG-SOURCE-INVALID",
          phase: "configuration",
          source: { specifier },
          path: [...position.path, "exportPath"],
          message:
            "A definition source exportPath must contain only normalized strings without control characters.",
          expected: "an array of NFC property keys without control characters",
          received: value.exportPath,
          repair: "Replace exportPath with an array of exported property keys.",
        }),
      };
    }
    if (value.exportPath.length > 0) {
      exportPath = [...value.exportPath];
    }
  }

  const source: DefinitionSource =
    exportPath === undefined ? { specifier } : { specifier, exportPath };
  const candidatePath = resolve(packageRoot, ...specifier.slice(2).split("/"));
  if (relativePathWithin(packageRoot, candidatePath) === null) {
    return {
      diagnostic: diagnostic({
        code: "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
        phase: "configuration",
        source,
        path: [...position.path, "specifier"],
        message: "The definition source path leaves the package root.",
        expected: "a path contained by the selected package root",
        received: specifier,
        repair: "Move the source into the package and update its specifier.",
      }),
    };
  }

  let moduleIdentity: string;
  try {
    moduleIdentity = resolveThroughExistingParent(candidatePath);
  } catch {
    return {
      diagnostic: diagnostic({
        code: "PH-CONFIG-SOURCE-INVALID",
        phase: "configuration",
        source,
        path: [...position.path, "specifier"],
        message: "The definition source path could not be resolved.",
        expected: "a resolvable path inside the package root",
        received: specifier,
        repair: "Fix the source path or its parent directory permissions.",
      }),
    };
  }

  if (relativePathWithin(packageRootIdentity, moduleIdentity) === null) {
    return {
      diagnostic: diagnostic({
        code: "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
        phase: "configuration",
        source,
        path: [...position.path, "specifier"],
        message:
          "The definition source resolves through a symlink outside the package root.",
        expected: "a real path contained by the selected package root",
        received: specifier,
        repair: "Replace the symlink with a source located inside the package.",
      }),
    };
  }

  return {
    source: { source, position, moduleIdentity },
  };
}

function failedConfigResolution(
  packageRoot: string,
  packageRootIdentity: string,
  diagnostics: readonly DefinitionSourceDiagnostic[],
  origin: DefinitionSourceSet["origin"] = "config",
  sources: readonly DefinitionSource[] = [],
): InternalResolution {
  return {
    status: "failed",
    packageRoot,
    packageRootIdentity,
    sourceSet: sourceSet("code-first", origin, sources),
    diagnostics: [...diagnostics].sort(compareDefinitionDiagnostics),
    internalSources: [],
  };
}

function duplicateDiagnostics(
  sources: readonly InternalSource[],
): readonly DefinitionSourceDiagnostic[] {
  const groups = new Map<string, InternalSource[]>();
  for (const source of sources) {
    const key = `${source.moduleIdentity}\0${canonicalJson(source.source.exportPath ?? [])}`;
    const group = groups.get(key);
    if (group) group.push(source);
    else groups.set(key, [source]);
  }

  const diagnostics: DefinitionSourceDiagnostic[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((left, right) => {
      const source = compareSources(left.source, right.source);
      return source !== 0
        ? source
        : compareDefinitionPaths(left.position.path, right.position.path);
    });
    const [first, ...rest] = ordered;
    diagnostics.push(
      diagnostic({
        code: "PH-CONFIG-DUPLICATE-SOURCE",
        phase: "configuration",
        source: first.source,
        path: first.position.path,
        message: "Multiple entries select the same module and export path.",
        expected: "one entry for each resolved module and export path",
        received: ordered.map((entry) => entry.source),
        repair: "Remove every duplicate entry except one.",
        related: rest.map((entry) => ({
          source: entry.source,
          path: entry.position.path,
          message: "This entry resolves to the same source identity.",
        })),
      }),
    );
  }
  return diagnostics.sort(compareDefinitionDiagnostics);
}

function publicResolution(
  value: InternalResolution,
): DefinitionSourceResolution {
  return {
    status: value.status,
    sourceSet: value.sourceSet,
    diagnostics: value.diagnostics,
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException(
    "The definition-source load was aborted.",
    "AbortError",
  );
}

export class DefinitionSourceLoader {
  readonly #importer: TypeScriptSourceImportInterface;
  readonly #importCache = new Map<
    string,
    Promise<Readonly<Record<string, unknown>>>
  >();

  constructor(importer: TypeScriptSourceImportInterface) {
    this.#importer = importer;
  }

  resolve(
    request: DefinitionSourceSelectionRequest,
  ): DefinitionSourceResolution {
    return publicResolution(this.#resolveInternal(request));
  }

  async load(
    request: DefinitionSourceLoadRequest,
  ): Promise<DefinitionSourceLoadResult> {
    throwIfAborted(request.signal);
    const resolution = this.#resolveInternal(request);
    if (resolution.status !== "ready") {
      return { ...publicResolution(resolution), values: [] };
    }

    if (!isSha256Digest(request.packageRevision)) {
      const invalidRevision = diagnostic({
        code: "PH-CONFIG-SOURCE-INVALID",
        phase: "configuration",
        path: ["packageRevision"],
        message: "The package revision is not a SHA-256 identifier.",
        expected: "sha256 followed by 64 lowercase hexadecimal characters",
        received: request.packageRevision,
        repair: "Pass the package revision produced by the active build graph.",
      });
      return {
        ...publicResolution({
          ...resolution,
          status: "failed",
          diagnostics: [invalidRevision],
        }),
        values: [],
      };
    }

    const modules = new Map<string, InternalSource[]>();
    for (const source of resolution.internalSources) {
      const group = modules.get(source.moduleIdentity);
      if (group) group.push(source);
      else modules.set(source.moduleIdentity, [source]);
    }

    const values: LoadedDefinitionSource[] = [];
    const diagnostics: DefinitionSourceDiagnostic[] = [];
    await Promise.all(
      [...modules.values()].map(async (moduleSources) => {
        throwIfAborted(request.signal);
        const representative = [...moduleSources].sort((left, right) =>
          compareSources(left.source, right.source),
        )[0];
        const cacheKey = canonicalJson([
          resolution.packageRootIdentity,
          request.packageRevision,
          representative.moduleIdentity,
        ]);

        const cacheable = request.signal === undefined;
        let imported = cacheable ? this.#importCache.get(cacheKey) : undefined;
        if (!imported) {
          imported = this.#importer.importModule({
            packageRoot: resolution.packageRoot,
            specifier: representative.source.specifier,
            packageRevision: request.packageRevision,
            signal: request.signal,
          });
          if (cacheable) {
            this.#importCache.set(cacheKey, imported);
            void imported.catch(() => this.#importCache.delete(cacheKey));
          }
        }

        let namespace: Readonly<Record<string, unknown>>;
        try {
          namespace = await imported;
          throwIfAborted(request.signal);
          if (!isRecord(namespace)) {
            throw new TypeError(
              "The import Adapter returned a non-object namespace.",
            );
          }
        } catch (error) {
          throwIfAborted(request.signal);
          for (const source of moduleSources) {
            const definitionDiagnostics = definitionDiagnosticsFromError(
              error,
              source.source,
            );
            if (definitionDiagnostics) {
              diagnostics.push(...definitionDiagnostics);
            } else {
              diagnostics.push(
                diagnostic({
                  code: "PH-IMPORT-FAILED",
                  phase: "import",
                  source: source.source,
                  path: [],
                  message:
                    "The definition source module could not be imported.",
                  expected: "an importable TypeScript module namespace",
                  received: errorKind(error),
                  repair:
                    "Fix this module or its imports, then run the definition check again.",
                }),
              );
            }
          }
          return;
        }

        for (const internal of moduleSources) {
          let current: unknown = namespace;
          let failed = false;
          const exportPath = internal.source.exportPath ?? [];
          for (let index = 0; index < exportPath.length; index += 1) {
            const key = exportPath[index];
            if (
              (typeof current !== "object" && typeof current !== "function") ||
              current === null
            ) {
              diagnostics.push(
                missingExportDiagnostic(internal.source, index, key),
              );
              failed = true;
              break;
            }
            try {
              if (!Object.prototype.hasOwnProperty.call(current, key)) {
                diagnostics.push(
                  missingExportDiagnostic(internal.source, index, key),
                );
                failed = true;
                break;
              }
              current = (current as Record<string, unknown>)[key];
            } catch (error) {
              diagnostics.push(
                diagnostic({
                  code: "PH-IMPORT-FAILED",
                  phase: "import",
                  source: internal.source,
                  path: ["exportPath", index],
                  message: "Reading the configured export threw an exception.",
                  expected: "a readable exported property",
                  received: errorKind(error),
                  repair:
                    "Remove import-time side effects from this exported property.",
                }),
              );
              failed = true;
              break;
            }
          }
          if (!failed) values.push({ source: internal.source, value: current });
        }
      }),
    );

    values.sort((left, right) => compareSources(left.source, right.source));
    diagnostics.sort(compareDefinitionDiagnostics);
    return {
      ...publicResolution({
        ...resolution,
        status: diagnostics.length === 0 ? "ready" : "failed",
        diagnostics,
      }),
      values,
    };
  }

  #resolveInternal(
    request: DefinitionSourceSelectionRequest,
  ): InternalResolution {
    const configFile = resolve(
      request.configFile ?? "./powerhouse.config.json",
    );
    const packageRoot = dirname(configFile);
    let packageRootIdentity = packageRoot;
    try {
      packageRootIdentity = realpathSync.native(packageRoot);
    } catch {
      // The strict config read below produces the deterministic diagnostic.
    }

    let config: PowerhouseConfig;
    try {
      config = getConfigStrict(configFile);
    } catch (error) {
      const reason =
        error instanceof ConfigFileError ? error.reason : "read-failed";
      return failedConfigResolution(packageRoot, packageRootIdentity, [
        diagnostic({
          code: "PH-CONFIG-SOURCE-INVALID",
          phase: "configuration",
          path: ["configFile"],
          message: "The selected Powerhouse config file could not be loaded.",
          expected: "an existing config file containing a JSON object",
          received: reason,
          repair: "Create or repair the selected powerhouse.config.json file.",
        }),
      ]);
    }

    const cliSources = request.cliSources ?? [];
    let rawSources: readonly unknown[];
    let origin: DefinitionSourceSet["origin"];
    if (cliSources.length > 0) {
      origin = "cli";
      const parsedSources: unknown[] = [];
      const parseDiagnostics: DefinitionSourceDiagnostic[] = [];
      for (let index = 0; index < cliSources.length; index += 1) {
        try {
          parsedSources.push(parseCliSource(cliSources[index]));
        } catch (error) {
          parseDiagnostics.push(
            diagnostic({
              code: "PH-CONFIG-SOURCE-INVALID",
              phase: "configuration",
              path: ["sources", index],
              message: (error as Error).message,
              expected: "./module.ts with an optional RFC 6901 fragment",
              received: cliSources[index],
              repair: "Fix this --source value and quote it in the shell.",
            }),
          );
        }
      }
      if (parseDiagnostics.length > 0) {
        return failedConfigResolution(
          packageRoot,
          packageRootIdentity,
          parseDiagnostics,
          origin,
        );
      }
      rawSources = parsedSources;
    } else {
      origin = "config";
      const definitionSources = (config as { definitionSources?: unknown })
        .definitionSources;
      if (!isRecord(definitionSources)) {
        return failedConfigResolution(packageRoot, packageRootIdentity, [
          diagnostic({
            code:
              definitionSources === undefined
                ? "PH-CONFIG-SOURCES-MISSING"
                : "PH-CONFIG-VERSION-UNSUPPORTED",
            phase: "configuration",
            path: ["definitionSources"],
            message:
              definitionSources === undefined
                ? "No definitionSources selection is configured."
                : "The definitionSources format version is missing or unsupported.",
            expected:
              "a V1 code-first source list or an explicit V1 legacy selection",
            received: definitionSources,
            repair:
              "Add definitionSources with formatVersion 1 and a supported mode.",
          }),
        ]);
      }

      if (definitionSources.formatVersion !== 1) {
        return failedConfigResolution(packageRoot, packageRootIdentity, [
          diagnostic({
            code: "PH-CONFIG-VERSION-UNSUPPORTED",
            phase: "configuration",
            path: ["definitionSources", "formatVersion"],
            message: "The definitionSources format version is unsupported.",
            expected: "1",
            received: definitionSources.formatVersion,
            repair: "Set definitionSources.formatVersion to 1.",
          }),
        ]);
      }

      if (definitionSources.mode === "legacy") {
        const extraKeys = Object.keys(definitionSources).filter(
          (key) => key !== "formatVersion" && key !== "mode",
        );
        if (extraKeys.length > 0) {
          return failedConfigResolution(packageRoot, packageRootIdentity, [
            diagnostic({
              code: "PH-CONFIG-SOURCE-INVALID",
              phase: "configuration",
              path: ["definitionSources"],
              message:
                "Legacy definitionSources configuration contains unsupported properties.",
              expected: "formatVersion and mode only",
              received: extraKeys.sort(compareCodeUnits),
              repair:
                "Remove entries and all other properties from legacy mode.",
            }),
          ]);
        }
        return {
          status: "skipped",
          packageRoot,
          packageRootIdentity,
          sourceSet: sourceSet("legacy", "config", []),
          diagnostics: [],
          internalSources: [],
        };
      }

      if (definitionSources.mode !== "code-first") {
        return failedConfigResolution(packageRoot, packageRootIdentity, [
          diagnostic({
            code: "PH-CONFIG-SOURCE-INVALID",
            phase: "configuration",
            path: ["definitionSources", "mode"],
            message: "The definitionSources mode is unsupported.",
            expected: "code-first or legacy",
            received: definitionSources.mode,
            repair: "Set definitionSources.mode to code-first or legacy.",
          }),
        ]);
      }

      const extraKeys = Object.keys(definitionSources).filter(
        (key) => key !== "formatVersion" && key !== "mode" && key !== "entries",
      );
      if (extraKeys.length > 0) {
        return failedConfigResolution(packageRoot, packageRootIdentity, [
          diagnostic({
            code: "PH-CONFIG-SOURCE-INVALID",
            phase: "configuration",
            path: ["definitionSources"],
            message:
              "Code-first definitionSources configuration contains unsupported properties.",
            expected: "formatVersion, mode, and entries",
            received: extraKeys.sort(compareCodeUnits),
            repair: "Remove the unsupported definitionSources properties.",
          }),
        ]);
      }

      if (
        !Array.isArray(definitionSources.entries) ||
        definitionSources.entries.length === 0
      ) {
        return failedConfigResolution(packageRoot, packageRootIdentity, [
          diagnostic({
            code: "PH-CONFIG-SOURCES-MISSING",
            phase: "configuration",
            path: ["definitionSources", "entries"],
            message: "Code-first mode requires at least one definition source.",
            expected: "a nonempty array of definition source entries",
            received: definitionSources.entries,
            repair: "Add an explicit definition source entry.",
          }),
        ]);
      }
      rawSources = definitionSources.entries;
    }

    const normalized = rawSources.map((value, index) =>
      normalizeSource(
        value,
        {
          path:
            origin === "cli"
              ? ["sources", index]
              : ["definitionSources", "entries", index],
        },
        packageRoot,
        packageRootIdentity,
      ),
    );
    const normalizationDiagnostics = normalized
      .flatMap((result) => (result.diagnostic ? [result.diagnostic] : []))
      .sort(compareDefinitionDiagnostics);
    const internalSources = normalized
      .flatMap((result) => (result.source ? [result.source] : []))
      .sort((left, right) => compareSources(left.source, right.source));
    const sources = internalSources.map((entry) => entry.source);

    if (normalizationDiagnostics.length > 0) {
      return failedConfigResolution(
        packageRoot,
        packageRootIdentity,
        normalizationDiagnostics,
        origin,
        sources,
      );
    }

    const duplicates = duplicateDiagnostics(internalSources);
    return {
      status: duplicates.length === 0 ? "ready" : "failed",
      packageRoot,
      packageRootIdentity,
      sourceSet: sourceSet("code-first", origin, sources),
      diagnostics: duplicates,
      internalSources,
    };
  }
}
