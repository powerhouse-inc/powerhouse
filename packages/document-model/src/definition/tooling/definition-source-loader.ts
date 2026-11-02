import type {
  DefinitionDiagnostic,
  DefinitionPath,
  DefinitionSource,
  DocumentModelModule,
  Sha256Digest,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  rejectionReceived,
  snapshotArray,
  snapshotRecord,
} from "../kernel/data-properties.js";
import {
  compareDefinitionPaths,
  describeReceived,
  sortDefinitionDiagnostics,
} from "../kernel/diagnostics.js";
import { compareCodeUnits } from "../kernel/primitives.js";
import {
  compareDefinitionSources,
  type InternalResolution,
  publicResolution,
  resolveDefinitionSources,
} from "./definition-source-resolution.js";
import type {
  DefinitionSourceLoadRequest,
  DefinitionSourceResolution,
  DefinitionSourceSelectionRequest,
  LoadedDefinition,
  LoadedDefinitionSet,
  TypeScriptSourceImportInterface,
} from "./definition-source-types.js";
import { toolingDiagnostics } from "./diagnostic-codes.js";
import {
  describeThrown,
  readProperty,
  structuredDiagnostics,
} from "./structured-diagnostics.js";

type Manifest = UpgradeManifest<readonly number[]>;

type Collected = {
  readonly documentModels: LoadedDefinition<DocumentModelModule>[];
  readonly upgradeManifests: LoadedDefinition<Manifest>[];
  readonly diagnostics: DefinitionDiagnostic[];

  readonly visited: Map<object, number>;
  readonly claimed: Map<
    string,
    { readonly source: DefinitionSource; readonly path: DefinitionPath }
  >;
};

type ImportedNamespace =
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
  | {
      readonly ok: false;
      readonly diagnostics: (
        source: DefinitionSource,
      ) => readonly DefinitionDiagnostic[];
    };

const KEY_SEPARATOR = String.fromCharCode(0);

function isSha256Digest(value: unknown): value is Sha256Digest {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function isVersionList(value: unknown): value is readonly number[] {
  return (
    Array.isArray(value) &&
    value.every(
      (version) => Number.isSafeInteger(version) && (version as number) > 0,
    )
  );
}

function isDocumentModelModule(record: Readonly<Record<string, unknown>>) {
  return (
    typeof record.reducer === "function" &&
    snapshotRecord(record.documentModel, undefined, []).ok
  );
}

function isUpgradeManifest(record: Readonly<Record<string, unknown>>) {
  return (
    typeof record.documentType === "string" &&
    Number.isSafeInteger(record.latestVersion) &&
    isVersionList(record.supportedVersions) &&
    snapshotRecord(record.upgrades, undefined, []).ok
  );
}

function familyMembers(
  record: Readonly<Record<string, unknown>>,
): readonly unknown[] | undefined {
  if (typeof record.at !== "function" || record.upgradeManifest === undefined) {
    return undefined;
  }
  const modules = snapshotArray(record.modules, []);
  return modules.ok ? modules.value : undefined;
}

function documentTypeOf(module: unknown): string {
  const stored = snapshotRecord(
    (module as { documentModel?: unknown }).documentModel,
    undefined,
    [],
  );
  const global = stored.ok
    ? snapshotRecord(stored.value.global, undefined, [])
    : undefined;
  return global?.ok === true && typeof global.value.id === "string"
    ? global.value.id
    : "";
}

function extendSource(
  source: DefinitionSource,
  path: DefinitionPath,
): DefinitionSource {
  const exportPath = [...(source.exportPath ?? []), ...path.map(String)];
  return {
    specifier: source.specifier,
    ...(exportPath.length > 0 && { exportPath }),
  };
}

function claim(
  collected: Collected,
  logicalKey: string,
  describe: string,
  source: DefinitionSource,
  path: DefinitionPath,
): void {
  const existing = collected.claimed.get(logicalKey);
  if (existing === undefined) {
    collected.claimed.set(logicalKey, { source, path });
    return;
  }
  collected.diagnostics.push(
    toolingDiagnostics.create({
      code: "PH-PKG-LOGICAL-COLLISION",
      source,
      path,
      message: `Two different values both declare ${describe}, so a host registering this package would keep only one of them.`,
      expected: "one value per logical definition",
      received: describe,
      repair:
        "Export one canonical value for this definition and remove the other source entry.",
      related: [
        {
          source: existing.source,
          path: existing.path,
          message: "The first value claiming it is here.",
        },
      ],
    }),
  );
}

function collectDocumentModel(
  collected: Collected,
  value: object,
  source: DefinitionSource,
  path: DefinitionPath,
): void {
  const module = value as DocumentModelModule;
  collected.documentModels.push({ source, path, value: module });
  const documentType = documentTypeOf(module);
  const version = (module as { version?: unknown }).version;

  if (documentType === "" || typeof version !== "number") return;
  claim(
    collected,
    ["document-model", documentType, String(version)].join(KEY_SEPARATOR),
    `document model ${documentType} version ${String(version)}`,
    source,
    path,
  );
}

function collectUpgradeManifest(
  collected: Collected,
  value: object,
  source: DefinitionSource,
  path: DefinitionPath,
): void {
  const manifest = value as Manifest;
  collected.upgradeManifests.push({ source, path, value: manifest });
  claim(
    collected,
    ["upgrade-manifest", manifest.documentType].join(KEY_SEPARATOR),
    `the upgrade manifest of ${manifest.documentType}`,
    source,
    path,
  );
}

function visit(
  collected: Collected,
  value: unknown,
  source: DefinitionSource,
  path: DefinitionPath,
): number {
  if (value === null || typeof value !== "object") return 0;
  const alias = collected.visited.get(value);
  if (alias !== undefined) return alias;

  collected.visited.set(value, 0);
  const found = walk(collected, value, source, path);
  collected.visited.set(value, found);
  return found;
}

function walk(
  collected: Collected,
  value: object,
  source: DefinitionSource,
  path: DefinitionPath,
): number {
  const array = snapshotArray(value, path);
  if (array.ok) {
    return array.value.reduce<number>(
      (count, member, index) =>
        count + visit(collected, member, source, [...path, index]),
      0,
    );
  }
  const plain = snapshotRecord(value, undefined, path);
  if (!plain.ok) {
    if (plain.reason !== "accessor" && plain.reason !== "inspection-failed") {
      return 0;
    }
    collected.diagnostics.push(
      toolingDiagnostics.create({
        code: "PH-PKG-DEFINITION-UNINSPECTABLE",
        source: extendSource(source, path),
        path,
        message: `This export could not be read safely (${plain.reason}).`,
        expected: "a plain object, an array, or a materialized definition",
        received: rejectionReceived(plain),
        repair:
          "Export plain values: a getter or a Proxy hides what the loader reads.",
      }),
    );
    return 0;
  }
  const record = plain.value;
  const members = familyMembers(record);
  if (members !== undefined) {
    const count = members.reduce<number>(
      (total, member, index) =>
        total + visit(collected, member, source, [...path, "modules", index]),
      0,
    );
    return (
      count +
      visit(collected, record.upgradeManifest, source, [
        ...path,
        "upgradeManifest",
      ])
    );
  }
  if (isDocumentModelModule(record)) {
    collectDocumentModel(collected, value, extendSource(source, path), path);
    return 1;
  }
  if (isUpgradeManifest(record)) {
    collectUpgradeManifest(collected, value, extendSource(source, path), path);
    return 1;
  }
  return Object.keys(record)
    .sort(compareCodeUnits)
    .reduce<number>(
      (count, key) =>
        count + visit(collected, record[key], source, [...path, key]),
      0,
    );
}

function checkManifestCoverage(collected: Collected): void {
  const versionsByType = new Map<string, number[]>();
  for (const entry of collected.documentModels) {
    const documentType = documentTypeOf(entry.value);
    const version = (entry.value as { version?: unknown }).version;
    if (documentType === "" || typeof version !== "number") continue;
    versionsByType.set(documentType, [
      ...(versionsByType.get(documentType) ?? []),
      version,
    ]);
  }
  const ascending = (left: number, right: number) => left - right;
  for (const manifest of collected.upgradeManifests) {
    const { documentType, supportedVersions, latestVersion, upgrades } =
      manifest.value;
    const definition = { kind: "document-model", key: documentType } as const;
    const loaded = [...(versionsByType.get(documentType) ?? [])].sort(
      ascending,
    );
    const declared = [...supportedVersions].sort(ascending);
    if (
      JSON.stringify(loaded) !== JSON.stringify(declared) ||
      latestVersion !== declared.at(-1)
    ) {
      collected.diagnostics.push(
        toolingDiagnostics.create({
          code: "PH-DM-DECLARATION-INVALID",
          source: manifest.source,
          definition,
          path: manifest.path,
          message:
            "The upgrade manifest and the selected modules of this document type describe different version sets.",
          expected: `supportedVersions ${JSON.stringify(loaded)} with latestVersion ${String(loaded.at(-1))}`,
          received: `supportedVersions ${JSON.stringify(declared)} with latestVersion ${String(latestVersion)}`,
          repair:
            "Select the whole family that materialize returned, so its modules and its manifest stay one declaration.",
        }),
      );
      continue;
    }
    const expected = declared.slice(1).map((version) => `v${version}`);
    const actual = Object.keys(upgrades).sort(compareCodeUnits);
    if (
      JSON.stringify(actual) !==
      JSON.stringify([...expected].sort(compareCodeUnits))
    ) {
      collected.diagnostics.push(
        toolingDiagnostics.create({
          code: "PH-DM-DECLARATION-INVALID",
          source: manifest.source,
          definition,
          path: [...manifest.path, "upgrades"],
          message:
            "The upgrade manifest does not carry exactly one transition for each version after the first.",
          expected: expected.join(", ") || "no transitions",
          received: actual.join(", ") || "no transitions",
          repair: "Publish the manifest materialize returned, unmodified.",
        }),
      );
    }
  }
}

/**
 * A native namespace carries a `Symbol.toStringTag` key and Vite's SSR
 * namespace exposes exports through getters; the data-property rules would
 * reject both without this flattening.
 */
function namespaceSnapshot(value: unknown): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    throw new TypeError(
      `The import adapter returned ${describeReceived(value)} instead of a module namespace.`,
    );
  }
  return Object.freeze({ ...(value as Record<string, unknown>) });
}

function unresolvedBareImportOf(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const match =
    /^Cannot find (?:package|module) '([^']+)' imported from '?(.+?)'?$/m.exec(
      error.message,
    );
  if (match === null) return undefined;
  const [, specifier, importer] = match;
  if (/^(?:[./\\]|[a-zA-Z][\w+.-]*:)/.test(specifier)) return undefined;
  const name = specifier
    .split("/")
    .slice(0, specifier.startsWith("@") ? 2 : 1)
    .join("/");
  const from = importer.startsWith("file:")
    ? fileURLToPath(importer)
    : importer;
  if (!isAbsolute(from)) return undefined;
  for (let directory = dirname(from); ; directory = dirname(directory)) {
    if (existsSync(join(directory, "node_modules", name))) return undefined;
    if (dirname(directory) === directory) return name;
  }
}

function importDiagnostics(
  error: unknown,
  source: DefinitionSource,
  missing: boolean,
): readonly DefinitionDiagnostic[] {
  if (missing) {
    return [
      toolingDiagnostics.create({
        code: "PH-IMPORT-FAILED",
        source,
        path: [],
        message: "definitionSources lists a module that does not exist.",
        expected: "an existing module inside the package",
        received: source.specifier,
        repair:
          "Fix the specifier, or remove the entry from definitionSources.entries in powerhouse.config.json.",
      }),
    ];
  }
  const structured = structuredDiagnostics(error, source);
  if (structured !== undefined) return structured;
  const unresolved = unresolvedBareImportOf(error);
  return [
    toolingDiagnostics.create({
      code: "PH-IMPORT-FAILED",
      source,
      path: [],
      message:
        unresolved === undefined
          ? "This definition source could not be imported."
          : `This definition source could not resolve the import ${unresolved}.`,
      expected:
        unresolved === undefined
          ? "an importable TypeScript module"
          : `a project alias or installed dependency resolving ${unresolved}`,
      received: describeThrown(error),
      repair:
        unresolved === undefined
          ? "Fix this module or one of its imports, then load it again."
          : `Check the project tsconfig paths and package dependencies for ${unresolved}. If it is an npm package, list it in package.json and install dependencies.`,
    }),
  ];
}

type SelectedExport =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly diagnostic: DefinitionDiagnostic };

function selectExport(
  source: DefinitionSource,
  namespace: Readonly<Record<string, unknown>>,
): SelectedExport {
  let current: unknown = namespace;
  const exportPath = source.exportPath ?? [];
  for (const [index, key] of exportPath.entries()) {
    const read =
      current !== null &&
      (typeof current === "object" || typeof current === "function")
        ? readProperty(current, key)
        : undefined;
    if (read?.ok !== true) {
      return {
        ok: false,
        diagnostic: toolingDiagnostics.create({
          code: "PH-CONFIG-SOURCE-INVALID",
          source,
          path: ["exportPath", index],
          message:
            read === undefined
              ? `The export pointer reads "${key}" from a value that has no properties.`
              : `The configured export "${key}" is absent, or is not a plain readable property.`,
          expected: read === undefined ? "an object or a namespace" : key,
          received: read === undefined ? describeReceived(current) : "missing",
          repair:
            "Point the export pointer at an exact exported property, spelled as it is exported.",
        }),
      };
    }
    current = read.value;
  }
  return { ok: true, value: current };
}

function sortBySource<T>(
  entries: readonly LoadedDefinition<T>[],
): readonly LoadedDefinition<T>[] {
  return [...entries].sort(
    (left, right) =>
      compareDefinitionSources(left.source, right.source) ||
      compareDefinitionPaths(left.path, right.path),
  );
}

function empty(resolution: DefinitionSourceResolution): LoadedDefinitionSet {
  return { ...resolution, documentModels: [], upgradeManifests: [] };
}

/**
 * @experimental Imports the selected definition sources and finds the
 * materialized document models, families and upgrade manifests they export.
 * It folds aliases, reports two values that claim one `documentType@version`,
 * and returns everything sorted by source, so neither config order nor
 * import completion order changes a result. Validity belongs to the
 * adapters; registration belongs to the host.
 */
export class DefinitionSourceLoader {
  readonly #importer: TypeScriptSourceImportInterface;
  readonly #imports = new Map<
    string,
    Promise<Readonly<Record<string, unknown>>>
  >();
  #revision: Sha256Digest | undefined;

  constructor(importer: TypeScriptSourceImportInterface) {
    this.#importer = importer;
  }

  resolve(
    request: DefinitionSourceSelectionRequest,
  ): DefinitionSourceResolution {
    return publicResolution(resolveDefinitionSources(request));
  }

  async normalizeDefinitionSources(
    request: DefinitionSourceLoadRequest,
  ): Promise<LoadedDefinitionSet> {
    request.signal?.throwIfAborted();
    const resolution = resolveDefinitionSources(request);
    if (resolution.status !== "ready") {
      return empty(publicResolution(resolution));
    }
    if (!isSha256Digest(request.packageRevision)) {
      return empty({
        packageRoot: resolution.packageRoot,
        sourceSet: resolution.sourceSet,
        status: "failed",
        diagnostics: [
          toolingDiagnostics.create({
            code: "PH-CONFIG-SOURCE-INVALID",
            path: ["packageRevision"],
            message:
              "The package revision is not a SHA-256 identifier, so no import can be bound to it.",
            expected: "sha256: followed by 64 lowercase hexadecimal digits",
            received:
              typeof request.packageRevision === "string"
                ? request.packageRevision
                : describeReceived(request.packageRevision),
            repair: "Pass a revision digest of the package's current files.",
          }),
        ],
      });
    }
    await this.#retainRevision(request.packageRevision);
    const namespaces = await this.#importModules(resolution, request);
    request.signal?.throwIfAborted();

    const collected: Collected = {
      documentModels: [],
      upgradeManifests: [],
      diagnostics: [],
      visited: new Map(),
      claimed: new Map(),
    };

    for (const entry of resolution.resolved) {
      const namespace = namespaces.get(entry.moduleIdentity);
      if (namespace === undefined) continue;
      if (!namespace.ok) {
        collected.diagnostics.push(...namespace.diagnostics(entry.source));
        continue;
      }
      const selected = selectExport(entry.source, namespace.value);
      if (!selected.ok) {
        collected.diagnostics.push(selected.diagnostic);
        continue;
      }
      if (visit(collected, selected.value, entry.source, []) === 0) {
        collected.diagnostics.push(
          toolingDiagnostics.create({
            code: "PH-PKG-DEFINITION-UNRECOGNIZED",
            source: entry.source,
            path: [],
            message:
              "This source exports no materialized document model, so selecting it loads nothing.",
            expected:
              "a module or family materialize returned, or a collection holding them",
            received: "no recognized definition",
            repair:
              "Point this entry at the export that materialize(...) returned.",
          }),
        );
      }
    }
    checkManifestCoverage(collected);

    const diagnostics = sortDefinitionDiagnostics(collected.diagnostics);
    return {
      packageRoot: resolution.packageRoot,
      sourceSet: resolution.sourceSet,
      status: diagnostics.some(({ severity }) => severity === "error")
        ? "failed"
        : "ready",
      diagnostics,
      documentModels: sortBySource(collected.documentModels),
      upgradeManifests: sortBySource(collected.upgradeManifests),
    };
  }

  async dispose(): Promise<void> {
    const revision = this.#revision;
    this.#imports.clear();
    this.#revision = undefined;
    if (revision !== undefined) {
      await this.#importer.disposeRevision?.(revision);
    }
  }

  async #retainRevision(revision: Sha256Digest): Promise<void> {
    if (this.#revision === revision) return;
    const superseded = this.#revision;
    this.#imports.clear();
    this.#revision = revision;
    if (superseded !== undefined) {
      await this.#importer.disposeRevision?.(superseded);
    }
  }

  async #importModules(
    resolution: InternalResolution,
    request: DefinitionSourceLoadRequest,
  ): Promise<Map<string, ImportedNamespace>> {
    const results = new Map<string, ImportedNamespace>();

    // Evaluate serially so aliases and their family share one module evaluation.
    for (const entry of resolution.resolved) {
      const { moduleIdentity, source } = entry;
      if (results.has(moduleIdentity)) continue;
      let namespace = this.#imports.get(moduleIdentity);
      if (namespace === undefined) {
        namespace = this.#importer.importModule({
          // Use the real root so symlink aliases cannot evaluate the module twice.
          packageRoot: resolution.packageRootIdentity,
          specifier: source.specifier,
          packageRevision: request.packageRevision,
          ...(request.signal !== undefined && { signal: request.signal }),
        });
        this.#imports.set(moduleIdentity, namespace);

        void namespace.catch(() => this.#imports.delete(moduleIdentity));
      }
      try {
        results.set(moduleIdentity, {
          ok: true,
          value: namespaceSnapshot(await namespace),
        });
      } catch (error) {
        const missing = !existsSync(moduleIdentity);
        results.set(moduleIdentity, {
          ok: false,
          diagnostics: (failedSource) =>
            importDiagnostics(error, failedSource, missing),
        });
      }
    }
    return results;
  }
}
