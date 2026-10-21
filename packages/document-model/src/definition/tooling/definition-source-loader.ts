import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DefinitionDiagnostic,
  DefinitionPath,
  DefinitionSource,
  DocumentModelModule,
  Sha256Digest,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import {
  rejectionReceived,
  snapshotArray,
  snapshotRecord,
} from "../data-properties.js";
import {
  describeReceived,
  compareDefinitionDiagnostics,
  compareDefinitionPaths,
  createDiagnostic,
} from "../diagnostics.js";
import {
  compareCodeUnits,
  isSha256Digest,
  throwIfAborted,
} from "../primitives.js";
import {
  compareDefinitionSources,
  publicResolution,
  selectedSources,
  resolveDefinitionSources,
} from "./definition-source-resolution.js";
import type {
  DefinitionSourceLoadRequest,
  DefinitionSourceResolution,
  DefinitionSourceSelectionRequest,
  LoadedDefinition,
  LoadedDefinitionSet,
  LoadedSubgraphSet,
  LoadedScalar,
  TypeScriptSourceImportInterface,
} from "./definition-source-types.js";
import type { ScalarBinding } from "../scalars/types.js";
import {
  describeThrown,
  readProperty,
  structuredDiagnostics,
} from "./structured-diagnostics.js";
import {
  isSubgraphClass,
  readSubgraphEntries,
  subgraphEntrySpecifiers,
  type SubgraphEntryNamespace,
} from "./subgraph-reader.js";

type ImportRequest = Pick<
  DefinitionSourceLoadRequest,
  "packageRevision" | "signal"
>;

type ImportCacheEntry = {
  readonly revision: Sha256Digest;
  readonly namespace: Promise<Readonly<Record<string, unknown>>>;
};

type RecognizedKind = "document-model" | "upgrade-manifest" | "scalar";

/**
 * Runs before anything sorts or serializes versions. A `supportedVersions` of
 * `[1n]` would make `JSON.stringify` throw and leave the check with no report.
 */
function isVersionList(value: unknown): value is readonly number[] {
  return (
    Array.isArray(value) &&
    value.every(
      (version) => Number.isSafeInteger(version) && (version as number) > 0,
    )
  );
}

/**
 * A generated module missing `definition` still matches, so the adapter can
 * report what is wrong with it instead of the source looking empty.
 */
function recognizeRecord(
  record: Readonly<Record<string, unknown>>,
): RecognizedKind | undefined {
  if (
    typeof record.reducer === "function" &&
    snapshotRecord(record.documentModel, undefined, []).ok
  ) {
    return "document-model";
  }
  if (
    typeof record.documentType === "string" &&
    Number.isSafeInteger(record.latestVersion) &&
    isVersionList(record.supportedVersions) &&
    snapshotRecord(record.upgrades, undefined, []).ok
  ) {
    return "upgrade-manifest";
  }
  // A hand-written scalar definition has no binding, so nothing can use it. It
  // is still recognised so the check can name it.
  if (record.kind === "powerhouse.scalar" && typeof record.name === "string") {
    return "scalar";
  }
  return undefined;
}

function recognizeCallable(value: unknown): RecognizedKind | undefined {
  if (typeof value !== "function") return undefined;
  const definition = readProperty(value, "definition");
  if (definition.ok) {
    const record = snapshotRecord(definition.value, undefined, []);
    // A `defineScalar` factory, or a catalog scalar factory the package
    // re-exports.
    if (record.ok && record.value.kind === "powerhouse.scalar") {
      return "scalar";
    }
  }
  return undefined;
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

type Collected = {
  readonly documentModels: LoadedDefinition<DocumentModelModule>[];
  readonly upgradeManifests: LoadedDefinition<
    UpgradeManifest<readonly number[]>
  >[];
  readonly scalars: LoadedDefinition<LoadedScalar>[];
  readonly diagnostics: DefinitionDiagnostic[];
  /**
   * A second export of the same object is an alias and adds nothing. The map
   * spans the whole selected set because aliases can span two files.
   */
  readonly visited: Map<object, number>;
  readonly claimed: Map<
    string,
    { readonly source: DefinitionSource; readonly path: DefinitionPath }
  >;
};

/** No file path contains NUL, and no document type or name is expected to. */
const KEY_SEPARATOR = String.fromCharCode(0);

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
    createDiagnostic({
      code: "PH-PKG-LOGICAL-COLLISION",
      source,
      path,
      message: `Two different values both declare ${describe}, so a host registering this package would silently keep only one of them.`,
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

/**
 * Records the exported value itself. The compilation report that carries a
 * declaration's report-only diagnostics is keyed on the module object, so a
 * copy would lose it.
 */
function collect(
  collected: Collected,
  kind: RecognizedKind,
  value: object,
  source: DefinitionSource,
  path: DefinitionPath,
): void {
  switch (kind) {
    case "document-model": {
      const module = value as DocumentModelModule;
      const documentType = documentTypeOf(module);
      const version = (module as { version?: unknown }).version;
      collected.documentModels.push({ source, path, value: module });
      // A key built from missing parts would collide with every other broken
      // module, which the adapter already reports.
      if (documentType !== "" && typeof version === "number") {
        claim(
          collected,
          ["document-model", documentType, String(version)].join(KEY_SEPARATOR),
          `document model ${documentType} version ${String(version)}`,
          source,
          path,
        );
      }
      return;
    }
    case "upgrade-manifest": {
      const manifest = value as UpgradeManifest<readonly number[]>;
      collected.upgradeManifests.push({ source, path, value: manifest });
      claim(
        collected,
        ["upgrade-manifest", manifest.documentType].join(KEY_SEPARATOR),
        `the upgrade manifest of ${manifest.documentType}`,
        source,
        path,
      );
      return;
    }
    case "scalar": {
      const scalar = scalarOf(value);
      collected.scalars.push({ source, path, value: scalar });
      if (scalar.name !== "") {
        claim(
          collected,
          ["scalar", scalar.name].join(KEY_SEPARATOR),
          `scalar ${scalar.name}`,
          source,
          path,
        );
      }
      return;
    }
  }
}

function scalarOf(value: object): LoadedScalar {
  // A factory carries its definition; reading `name` off the callable itself
  // would report the function's name instead of the scalar's.
  const definition = readProperty(value, "definition");
  const record = definition.ok
    ? snapshotRecord(definition.value, undefined, [])
    : undefined;
  if (record?.ok === true && typeof record.value.name === "string") {
    const binding = readProperty(value, "binding");
    return {
      name: record.value.name,
      ...(binding.ok &&
        binding.value !== null &&
        typeof binding.value === "object" && {
          binding: binding.value as ScalarBinding,
        }),
    };
  }
  const direct = readProperty(value, "name");
  return {
    name: direct.ok && typeof direct.value === "string" ? direct.value : "",
  };
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

/** Returns the number of definitions found, so an empty source is reported. */
function visit(
  collected: Collected,
  value: unknown,
  source: DefinitionSource,
  path: DefinitionPath,
): number {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return 0;
  }
  const alias = collected.visited.get(value);
  if (alias !== undefined) return alias;
  // Recorded before the walk so a cycle folds instead of recursing.
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
  if (isSubgraphClass(value)) {
    collected.diagnostics.push(ignoredSubgraphDiagnostic(source, path));
    return 1;
  }
  const callable = recognizeCallable(value);
  if (callable !== undefined) {
    collect(collected, callable, value, extendSource(source, path), path);
    return 1;
  }
  if (typeof value === "function") return 0;

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
    // A class instance, a `Date`, a `Map`, or a Zod schema cannot hold a
    // definition, so it is skipped. Only a value the loader cannot read, such
    // as an accessor, a Proxy, or a revoked reference, is reported, because
    // the check cannot tell what it is.
    if (plain.reason !== "accessor" && plain.reason !== "inspection-failed") {
      return 0;
    }
    collected.diagnostics.push(
      createDiagnostic({
        code: "PH-PKG-DEFINITION-UNINSPECTABLE",
        source: extendSource(source, path),
        path,
        message: `This export could not be read safely (${plain.reason}).`,
        expected: "a plain object, an array, or a finalized definition",
        received: rejectionReceived(plain),
        repair:
          "Export plain values: a getter or a Proxy in a definition collection hides what a check would read.",
      }),
    );
    return 0;
  }

  const members = familyMembers(plain.value);
  if (members !== undefined) {
    const count = members.reduce<number>(
      (total, member, index) =>
        total + visit(collected, member, source, [...path, "modules", index]),
      0,
    );
    return (
      count +
      visit(collected, plain.value.upgradeManifest, source, [
        ...path,
        "upgradeManifest",
      ])
    );
  }

  const recognized = recognizeRecord(plain.value);
  if (recognized !== undefined) {
    collect(collected, recognized, value, extendSource(source, path), path);
    return 1;
  }

  return Object.keys(plain.value)
    .sort(compareCodeUnits)
    .reduce<number>(
      (count, key) =>
        count + visit(collected, plain.value[key], source, [...path, key]),
      0,
    );
}

function ignoredSubgraphDiagnostic(
  source: DefinitionSource,
  path: DefinitionPath,
): DefinitionDiagnostic {
  return createDiagnostic({
    code: "PH-CONFIG-SOURCE-SUBGRAPH-IGNORED",
    source: extendSource(source, path),
    path,
    message:
      "definitionSources lists a subgraph. Subgraphs are found through subgraphs/index.ts and subgraphs/*/index.ts, so this entry is ignored.",
    expected: "a document model, a family, or a scalar",
    received: "a subgraph class",
    repair:
      "Remove the entry from definitionSources.entries in powerhouse.config.json, and export the subgraph from subgraphs/index.ts.",
  });
}

/**
 * A manifest alone says which versions a document type publishes and how a
 * document moves between them. One that disagrees with the selected modules
 * would make a package look upgradeable along a path no module implements, so
 * the mismatch is reported rather than resolved.
 */
function checkManifestCoverage(collected: Collected): void {
  const versionsByType = new Map<string, number[]>();
  for (const entry of collected.documentModels) {
    const documentType = documentTypeOf(entry.value);
    const version = (entry.value as { version?: unknown }).version;
    if (documentType === "" || typeof version !== "number") continue;
    const versions = versionsByType.get(documentType);
    if (versions === undefined) versionsByType.set(documentType, [version]);
    else versions.push(version);
  }

  for (const manifest of collected.upgradeManifests) {
    const { documentType, supportedVersions, latestVersion, upgrades } =
      manifest.value as {
        documentType: string;
        supportedVersions: readonly number[];
        latestVersion: number;
        upgrades: Readonly<Record<string, unknown>>;
      };
    const loaded = (versionsByType.get(documentType) ?? [])
      .slice()
      .sort((left, right) => left - right);
    const declared = [...supportedVersions].sort((left, right) => left - right);
    const sameVersions =
      loaded.length === declared.length &&
      declared.every((version, index) => version === loaded[index]);
    if (!sameVersions || latestVersion !== declared.at(-1)) {
      collected.diagnostics.push(
        createDiagnostic({
          code: "PH-DM-DECLARATION-INVALID",
          source: manifest.source,
          definition: { kind: "document-model", key: documentType },
          path: manifest.path,
          message:
            "The upgrade manifest and the selected modules of this document type describe different version sets.",
          expected: `supportedVersions ${JSON.stringify(loaded)} with latestVersion ${String(loaded.at(-1))}`,
          received: `supportedVersions ${JSON.stringify(declared)} with latestVersion ${String(latestVersion)}`,
          repair:
            "Select the whole family from one defineDocumentModelFamily result, so its modules and its manifest stay one declaration.",
        }),
      );
      continue;
    }
    const expectedTransitions = declared
      .slice(1)
      .map((version) => `v${String(version)}`);
    const actualTransitions = Object.keys(upgrades).sort(compareCodeUnits);
    const missing = expectedTransitions.filter(
      (key) => !actualTransitions.includes(key),
    );
    const extra = actualTransitions.filter(
      (key) => !expectedTransitions.includes(key),
    );
    if (missing.length > 0 || extra.length > 0) {
      collected.diagnostics.push(
        createDiagnostic({
          code: "PH-DM-DECLARATION-INVALID",
          source: manifest.source,
          definition: { kind: "document-model", key: documentType },
          path: [...manifest.path, "upgrades"],
          message:
            "The upgrade manifest does not carry exactly one transition for each version after the first.",
          expected: expectedTransitions.join(", ") || "no transitions",
          received: actualTransitions.join(", ") || "no transitions",
          repair:
            "Publish the manifest defineDocumentModelFamily returned, unmodified.",
        }),
      );
    }
  }
}

/**
 * Loads definitions for `ph model check`, `ph model inspect`, and the build
 * gate, so none of them can check one set of definitions and publish another.
 * It resolves specifiers and export pointers, folds aliases, and reports two
 * values that claim one `documentType@version`. Validity belongs to
 * `checkDefinitions`, and host registration to the host's package loader.
 */
export class DefinitionSourceLoader {
  readonly #importer: TypeScriptSourceImportInterface;
  readonly #imports = new Map<string, ImportCacheEntry>();
  #revision: Sha256Digest | undefined;

  readonly #reportedSharedBases = new Set<string>();
  readonly #onSharedBase:
    | ((base: LoadedSubgraphSet["sharedBases"][number]) => void)
    | undefined;

  constructor(
    importer: TypeScriptSourceImportInterface,
    options: {
      readonly onSharedBase?: (
        base: LoadedSubgraphSet["sharedBases"][number],
      ) => void;
    } = {},
  ) {
    this.#importer = importer;
    this.#onSharedBase = options.onSharedBase;
  }

  /** The selected sources, without importing any of them. */
  resolve(
    request: DefinitionSourceSelectionRequest,
  ): DefinitionSourceResolution {
    return publicResolution(resolveDefinitionSources(request));
  }

  /** The result does not depend on entry order or on the import adapter. */
  async normalizeDefinitionSources(
    request: DefinitionSourceLoadRequest,
  ): Promise<LoadedDefinitionSet> {
    throwIfAborted(request.signal, "The definition source load");
    const resolution = resolveDefinitionSources(request);
    const empty = {
      documentModels: [],
      upgradeManifests: [],
      subgraphs: [],
      scalars: [],
    } as const;
    const subgraphEntries =
      resolution.status === "failed"
        ? []
        : subgraphEntrySpecifiers(resolution.packageRootIdentity);
    if (
      resolution.status === "failed" ||
      (resolution.status === "skipped" && subgraphEntries.length === 0)
    ) {
      return { ...publicResolution(resolution), ...empty };
    }
    if (!isSha256Digest(request.packageRevision)) {
      return {
        ...selectedSources(resolution),
        status: "failed",
        diagnostics: [
          createDiagnostic({
            code: "PH-CONFIG-SOURCE-INVALID",
            path: ["packageRevision"],
            message:
              "The package revision is not a SHA-256 identifier, so nothing can be bound to it.",
            expected: "sha256: followed by 64 lowercase hexadecimal digits",
            received:
              typeof request.packageRevision === "string"
                ? request.packageRevision
                : describeReceived(request.packageRevision),
            repair:
              "Pass the package revision the active build graph produced.",
          }),
        ],
        ...empty,
      };
    }

    await this.#retainRevision(request.packageRevision);

    const subgraphs = await this.#readSubgraphs(
      resolution.packageRootIdentity,
      subgraphEntries,
      request,
    );
    if (resolution.status === "skipped") {
      return {
        ...publicResolution(resolution),
        ...empty,
        subgraphs: subgraphs.subgraphs,
        diagnostics: [...subgraphs.diagnostics].sort(
          compareDefinitionDiagnostics,
        ),
      };
    }

    const namespaces = await this.#importModules(
      resolution.packageRootIdentity,
      resolution.resolved,
      request,
    );
    throwIfAborted(request.signal, "The definition source load");

    const collected: Collected = {
      documentModels: [],
      upgradeManifests: [],
      scalars: [],
      diagnostics: [],
      visited: new Map(),
      claimed: new Map(),
    };

    // Resolved order, by specifier and then export path, decides which alias
    // folds and which value is the first claim of a logical key, so import
    // completion order cannot.
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
      const found = visit(collected, selected.value, entry.source, []);
      if (found === 0) {
        collected.diagnostics.push(
          createDiagnostic({
            code: "PH-PKG-DEFINITION-UNRECOGNIZED",
            source: entry.source,
            path: [],
            message:
              "This source exports no finalized definition, so selecting it checks nothing.",
            expected:
              "a finalized document model, a family, or a collection holding them",
            received: "no recognised definition",
            repair:
              "Point this entry at the export that defineDocumentModel or defineDocumentModelFamily returned.",
          }),
        );
      }
    }

    checkManifestCoverage(collected);

    const diagnostics = [
      ...collected.diagnostics,
      ...subgraphs.diagnostics,
    ].sort(compareDefinitionDiagnostics);
    return {
      ...selectedSources(resolution),
      status: diagnostics.some(({ severity }) => severity === "error")
        ? "failed"
        : "ready",
      diagnostics,
      documentModels: sortBySource(collected.documentModels),
      upgradeManifests: sortBySource(collected.upgradeManifests),
      subgraphs: subgraphs.subgraphs,
      scalars: sortBySource(collected.scalars),
    };
  }

  /**
   * The package's subgraph classes, read through the subgraph protocol from
   * its subgraph entries, whatever `definitionSources` says. Runs author code
   * as {@link readSubgraphEntries} describes.
   */
  async readSubgraphs(
    request: ImportRequest & { readonly packageRoot: string },
  ): Promise<LoadedSubgraphSet> {
    throwIfAborted(request.signal, "The subgraph load");
    const packageRoot = realpathSync.native(request.packageRoot);
    await this.#retainRevision(request.packageRevision);
    const read = await this.#readSubgraphs(
      packageRoot,
      subgraphEntrySpecifiers(packageRoot),
      request,
    );
    return {
      sharedBases: read.sharedBases,
      subgraphs: read.subgraphs,
      diagnostics: [...read.diagnostics].sort(compareDefinitionDiagnostics),
    };
  }

  /** Releases every cached import and whatever the adapter bound to them. */
  async dispose(): Promise<void> {
    const revision = this.#revision;
    this.#imports.clear();
    this.#revision = undefined;
    if (revision !== undefined) {
      await this.#importer.disposeRevision?.(revision);
    }
  }

  /**
   * A watch session that edited a reducer helper gets a fresh import even
   * though the definition digest did not move.
   */
  async #retainRevision(revision: Sha256Digest): Promise<void> {
    if (this.#revision === revision) return;
    const superseded = this.#revision;
    this.#imports.clear();
    this.#revision = revision;
    if (superseded !== undefined) {
      await this.#importer.disposeRevision?.(superseded);
    }
  }

  async #readSubgraphs(
    packageRootIdentity: string,
    specifiers: readonly `./${string}`[],
    request: ImportRequest,
  ): Promise<LoadedSubgraphSet> {
    const entries = specifiers.map((specifier) => ({
      moduleIdentity: realpathSync(resolve(packageRootIdentity, specifier)),
      source: { specifier },
    }));
    const namespaces = await this.#importModules(
      packageRootIdentity,
      entries,
      request,
    );
    throwIfAborted(request.signal, "The definition source load");
    const diagnostics: DefinitionDiagnostic[] = [];
    const loaded: SubgraphEntryNamespace[] = [];
    for (const entry of entries) {
      const namespace = namespaces.get(entry.moduleIdentity);
      if (namespace === undefined) continue;
      if (namespace.ok) {
        loaded.push({
          specifier: entry.source.specifier,
          namespace: namespace.value,
        });
      } else {
        diagnostics.push(...namespace.diagnostics(entry.source));
      }
    }
    const read = readSubgraphEntries(loaded);
    for (const base of read.sharedBases) {
      const key = JSON.stringify([packageRootIdentity, base.source]);
      if (this.#reportedSharedBases.has(key)) continue;
      this.#reportedSharedBases.add(key);
      this.#onSharedBase?.(base);
    }
    return {
      sharedBases: read.sharedBases,
      subgraphs: read.subgraphs,
      diagnostics: [...diagnostics, ...read.diagnostics],
    };
  }

  async #importModules(
    packageRootIdentity: string,
    resolved: readonly {
      readonly moduleIdentity: string;
      readonly source: DefinitionSource;
    }[],
    request: ImportRequest,
  ): Promise<Map<string, ImportedNamespace>> {
    const byModule = new Map<string, (typeof resolved)[number]>();
    for (const entry of resolved) {
      if (!byModule.has(entry.moduleIdentity)) {
        byModule.set(entry.moduleIdentity, entry);
      }
    }
    const results = new Map<string, ImportedNamespace>();
    // One root at a time. Two roots that share a module, such as an alias and
    // the family it names, must reach the same object, and a module system
    // guarantees that only after the first evaluation finishes. Concurrent
    // imports can evaluate the shared module twice and turn an alias into a
    // logical collision.
    for (const [moduleIdentity, entry] of byModule) {
      const cacheKey = [packageRootIdentity, moduleIdentity].join(
        KEY_SEPARATOR,
      );
      let cached = this.#imports.get(cacheKey);
      if (cached === undefined || cached.revision !== request.packageRevision) {
        const namespace = this.#importer.importModule({
          // Under a symlinked root, such as a macOS temp directory, an adapter
          // could evaluate one module under two paths, and two exports of one
          // definition would look like two definitions.
          packageRoot: packageRootIdentity,
          specifier: entry.source.specifier,
          packageRevision: request.packageRevision,
          ...(request.signal !== undefined && { signal: request.signal }),
        });
        cached = { revision: request.packageRevision, namespace };
        this.#imports.set(cacheKey, cached);
        // A rejected import must not be replayed to the next check, which
        // may be running against repaired source.
        void namespace.catch(() => this.#imports.delete(cacheKey));
      }
      try {
        results.set(moduleIdentity, {
          ok: true,
          value: namespaceSnapshot(await cached.namespace),
        });
      } catch (error) {
        const missing = !existsSync(moduleIdentity);
        results.set(moduleIdentity, {
          ok: false,
          diagnostics: (source) =>
            missing
              ? [missingModuleDiagnostic(source)]
              : importDiagnostics(error, source),
        });
      }
    }
    return results;
  }
}

/**
 * A native namespace carries a `Symbol.toStringTag` key and Vite's SSR
 * namespace exposes exports through getters, so the loader's data-property
 * rules would reject every real import without this flattening.
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

type ImportedNamespace =
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
  | {
      readonly ok: false;
      readonly diagnostics: (
        source: DefinitionSource,
      ) => readonly DefinitionDiagnostic[];
    };

function missingModuleDiagnostic(
  source: DefinitionSource,
): DefinitionDiagnostic {
  return createDiagnostic({
    code: "PH-IMPORT-FAILED",
    source,
    path: [],
    message: "definitionSources lists a module that does not exist.",
    expected: "an existing module inside the package",
    received: source.specifier,
    repair:
      "Fix the specifier, or remove the entry from definitionSources.entries in powerhouse.config.json.",
  });
}

/**
 * A structured compilation failure keeps its own diagnostics. Any other error
 * fails only this source, and the sources beside it still report.
 */
function importDiagnostics(
  error: unknown,
  source: DefinitionSource,
): readonly DefinitionDiagnostic[] {
  const structured = structuredDiagnostics(error, source);
  if (structured !== undefined) return structured;
  const missing = uninstalledPackageOf(error);
  if (missing !== undefined) {
    return [
      createDiagnostic({
        code: "PH-IMPORT-FAILED",
        source,
        path: [],
        message: `This definition source needs the package ${missing}, which is not installed.`,
        expected: `${missing} installed in the package`,
        received: describeThrown(error),
        repair: `Install ${missing}: list it in package.json and run your package manager's install, then run the definition check again.`,
      }),
    ];
  }
  return [
    createDiagnostic({
      code: "PH-IMPORT-FAILED",
      source,
      path: [],
      message: "This definition source could not be imported.",
      expected: "an importable TypeScript module",
      received: describeThrown(error),
      repair:
        "Fix this module or one of its imports, then run the definition check again.",
    }),
  ];
}

/**
 * The package a failed import names when no `node_modules` above the
 * importing file holds it. Node and Vite both report a bare specifier they
 * cannot resolve as `Cannot find package|module '<specifier>' imported from
 * <file>`.
 */
function uninstalledPackageOf(error: unknown): string | undefined {
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

type SelectedExport =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly diagnostic: DefinitionDiagnostic };

/** Walks the export pointer and reports the first step that fails. */
function selectExport(
  source: DefinitionSource,
  namespace: Readonly<Record<string, unknown>>,
): SelectedExport {
  let current: unknown = namespace;
  const exportPath = source.exportPath ?? [];
  for (let index = 0; index < exportPath.length; index += 1) {
    const key = exportPath[index];
    if (
      current === null ||
      (typeof current !== "object" && typeof current !== "function")
    ) {
      return {
        ok: false,
        diagnostic: createDiagnostic({
          code: "PH-CONFIG-SOURCE-INVALID",
          source,
          path: ["exportPath", index],
          message: `The export pointer reads "${key}" from a value that has no properties.`,
          expected: "an object or a namespace to read the next key from",
          received: describeReceived(current),
          repair: "Shorten the export pointer to the export that exists.",
        }),
      };
    }
    const read = readProperty(current, key);
    if (!read.ok) {
      return {
        ok: false,
        diagnostic: createDiagnostic({
          code: "PH-CONFIG-SOURCE-INVALID",
          source,
          path: ["exportPath", index],
          message: `The configured export "${key}" is absent, or is not a plain readable property.`,
          expected: key,
          received: "missing",
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
  return [...entries].sort((left, right) => {
    const bySource = compareDefinitionSources(left.source, right.source);
    return bySource !== 0
      ? bySource
      : compareDefinitionPaths(left.path, right.path);
  });
}
