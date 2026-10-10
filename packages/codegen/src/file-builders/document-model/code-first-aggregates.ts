import type { PowerhouseModule } from "@powerhousedao/shared";
import { POWERHOUSE_CONFIG_FILE } from "@powerhousedao/shared/clis";
import {
  ConfigFileError,
  getConfigStrict,
} from "@powerhousedao/shared/clis/config-strict";
import type {
  DefinitionSource,
  Sha256Digest,
} from "@powerhousedao/shared/document-model";
import { kebabCase } from "change-case";
import {
  DefinitionSourceLoader,
  findCodeFirstDefinitions,
  findUnregisteredDefinitions,
  formatDefinitionDiagnostic,
  resolveDefinitionSelection,
  unregisteredDefinitionDiagnostic,
  type UnregisteredDefinition,
  type DefinitionSourceResolution,
  type LoadedDefinition,
  type LoadedDefinitionSet,
  type SubgraphClass,
} from "document-model/tooling";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { firstBy, isObjectType, isString, prop, uniqueBy } from "remeda";
import {
  VariableDeclarationKind,
  type ArrayLiteralExpression,
  type SourceFile,
} from "ts-morph";
import { ViteTypeScriptSourceImportAdapter } from "../../utils/definition-source-importer.js";

type CollectionName = "documentModels" | "upgradeManifests";
export type CodeFirstAggregateSource = {
  moduleSpecifier: string;
  exportNamespace: boolean;
  documentModels: readonly DefinitionSource[];
  upgradeManifests: readonly DefinitionSource[];
  manifestDocumentTypes: readonly string[];
};

export type CodeFirstInventory =
  | { kind: "none" }
  | { kind: "unavailable"; reason: string }
  | {
      kind: "loaded";
      documentModels: PowerhouseModule[];
      subgraphs: PowerhouseModule[];
    };

function isReadable(configFile: string): boolean {
  try {
    getConfigStrict(configFile);
    return true;
  } catch (error) {
    if (error instanceof ConfigFileError) return false;
    throw error;
  }
}

function resolveCodeFirstSelection(
  configFile: string,
): DefinitionSourceResolution | undefined {
  if (!existsSync(configFile) || !isReadable(configFile)) return undefined;
  const selection = resolveDefinitionSelection({ configFile });
  if (selection.status === "skipped") return undefined;
  if (selection.status === "failed")
    throw new Error(
      selection.diagnostics.map(formatDefinitionDiagnostic).join("\n"),
    );
  return selection;
}

function unregistered(projectDir: string): {
  mode: DefinitionSourceResolution["sourceSet"]["mode"];
  definitions: UnregisteredDefinition[];
} {
  const configFile = join(projectDir, POWERHOUSE_CONFIG_FILE);
  if (!existsSync(configFile))
    return {
      mode: "schema-first",
      definitions: findCodeFirstDefinitions(projectDir),
    };
  if (!isReadable(configFile)) return { mode: "schema-first", definitions: [] };
  const selection = resolveDefinitionSelection({ configFile });
  return {
    mode: selection.sourceSet.mode,
    definitions:
      selection.status === "failed"
        ? []
        : findUnregisteredDefinitions(selection),
  };
}

export function unregisteredCodeFirstDefinitions(
  projectDir: string,
): UnregisteredDefinition[] {
  return unregistered(projectDir).definitions;
}

export function warnUnregisteredCodeFirstDefinitions(
  projectDir: string,
  kind: UnregisteredDefinition["kind"],
) {
  const { mode, definitions } = unregistered(projectDir);
  for (const definition of definitions.filter((d) => d.kind === kind)) {
    console.warn(
      `⚠ ${formatDefinitionDiagnostic(unregisteredDefinitionDiagnostic(definition, mode))}`,
    );
  }
}

type ImportSource = (
  specifier: `./${string}`,
) => Promise<Readonly<Record<string, unknown>>>;

/** The import path, from `fromDir`, of the JavaScript a source compiles to. */
export function emittedImportPath(
  fromDir: string,
  projectDir: string,
  specifier: `./${string}`,
) {
  const emitted = specifier.replace(/\.(m?)ts$/, ".$1js");
  const path = relative(fromDir, resolve(projectDir, emitted)).replaceAll(
    "\\",
    "/",
  );
  return path.startsWith(".") ? path : `./${path}`;
}

async function readCodeFirstSources<T>(
  configFile: string,
  read: (
    loaded: LoadedDefinitionSet,
    importSource: ImportSource,
  ) => T | Promise<T>,
): Promise<T> {
  const importer = new ViteTypeScriptSourceImportAdapter();
  const loader = new DefinitionSourceLoader(importer);
  // A fresh import environment binds each generation pass; none is reused across passes.
  const packageRevision: Sha256Digest = `sha256:${createHash("sha256").update(randomUUID()).digest("hex")}`;
  try {
    const loaded = await loader.normalizeDefinitionSources({
      configFile,
      packageRevision,
    });
    if (loaded.status === "failed")
      throw new Error(
        loaded.diagnostics.map(formatDefinitionDiagnostic).join("\n"),
      );
    // The loader imports under the real path, so this reaches the module
    // instances the loaded values came from.
    const packageRoot = realpathSync(dirname(configFile));
    return await read(loaded, (specifier) =>
      importer.importModule({ packageRoot, specifier, packageRevision }),
    );
  } finally {
    await loader.dispose();
  }
}

export async function codeFirstAggregateSources(
  projectDir: string,
): Promise<CodeFirstAggregateSource[]> {
  const configFile = join(projectDir, POWERHOUSE_CONFIG_FILE);
  const selection = resolveCodeFirstSelection(configFile);
  if (selection === undefined) return [];
  const generatedFiles = new Set(
    ["index.ts", "document-models.ts", "upgrade-manifests.ts"].map((name) => {
      const file = join(projectDir, "document-models", name);
      return existsSync(file) ? realpathSync(file) : resolve(file);
    }),
  );
  for (const source of selection.sourceSet.sources) {
    const file = resolve(projectDir, source.specifier);
    if (!existsSync(file)) {
      throw new Error(
        `definitionSources in powerhouse.config.json lists ${source.specifier}, which does not exist. Fix the specifier or remove the entry.`,
      );
    }
    if (generatedFiles.has(realpathSync(file))) {
      throw new Error(
        `Cannot regenerate document-model aggregates while definitionSources selects ${source.specifier}. Select the original authored definition file instead of a generated aggregate.`,
      );
    }
  }
  return await readCodeFirstSources(configFile, (loaded) => {
    const sources = new Map<string, CodeFirstAggregateSource>();
    for (const name of ["documentModels", "upgradeManifests"] as const) {
      for (const artifact of loaded[name]) {
        const specifier = artifact.source.specifier;
        let source = sources.get(specifier);
        if (!source) {
          source = {
            moduleSpecifier: emittedImportPath(
              join(projectDir, "document-models"),
              projectDir,
              specifier,
            ),
            exportNamespace: loaded.sourceSet.sources.some(
              (entry) => entry.specifier === specifier && !entry.exportPath,
            ),
            documentModels: [],
            upgradeManifests: [],
            manifestDocumentTypes: loaded.upgradeManifests
              .filter((manifest) => manifest.source.specifier === specifier)
              .map((manifest) => manifest.value.documentType),
          };
          sources.set(specifier, source);
        }
        source[name] = [...source[name], artifact.source];
      }
    }
    return [...sources.values()];
  });
}

const isNonEmptyString = (value: unknown): value is string =>
  isString(value) && value !== "";

function documentModelModule({
  source,
  value,
}: LoadedDefinitionSet["documentModels"][number]): PowerhouseModule {
  const global: unknown = value.documentModel.global;
  if (
    isObjectType(global) &&
    "id" in global &&
    "name" in global &&
    isNonEmptyString(global.id) &&
    isNonEmptyString(global.name)
  ) {
    return { id: global.id, name: global.name };
  }
  throw new Error(
    `${source.specifier} exports a document model without an id or a name, so it cannot be listed in powerhouse.manifest.json. Run ph model check for the details.`,
  );
}

function subgraphModule({
  source,
  value,
}: LoadedDefinition<SubgraphClass>): PowerhouseModule {
  const definition = "definition" in value ? value.definition : undefined;
  if (
    isObjectType(definition) &&
    "name" in definition &&
    isNonEmptyString(definition.name)
  ) {
    return { id: kebabCase(definition.name), name: definition.name };
  }
  throw new Error(
    `${source.specifier} exports a subgraph without a name, so it cannot be listed in powerhouse.manifest.json. Run ph model check for the details.`,
  );
}

/**
 * The manifest entries for every model and subgraph the package's code-first
 * sources compile to. Identity comes from the compiled values, not from where
 * the sources live. `unavailable` carries the diagnostics or error of any other
 * selection or source that cannot be loaded, and names the source of a model
 * or subgraph without an id or a name.
 */
export async function loadCodeFirstInventory(
  projectDir: string,
): Promise<CodeFirstInventory> {
  const configFile = join(projectDir, POWERHOUSE_CONFIG_FILE);
  try {
    if (resolveCodeFirstSelection(configFile) === undefined)
      return { kind: "none" };
    return await readCodeFirstSources(configFile, (loaded) => ({
      kind: "loaded",
      documentModels: uniqueBy(
        loaded.documentModels.map(documentModelModule),
        prop("id"),
      ),
      subgraphs: uniqueBy(loaded.subgraphs.map(subgraphModule), prop("id")),
    }));
  } catch (error) {
    return {
      kind: "unavailable",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export type CodeFirstDocumentModelExport = {
  readonly name: string;
  readonly version: number | undefined;
  /** The source the loader read the latest version from. */
  readonly specifier: `./${string}`;
  /** A selected source that exports the latest version by an importable name. */
  readonly binding:
    | { readonly specifier: `./${string}`; readonly exportName: string }
    | undefined;
};

const isImportableName = (name: string) =>
  name !== "default" && /^[A-Za-z_$][\w$]*$/.test(name);

/**
 * The latest code-first version of `documentModelId`, or `undefined` when no
 * code-first source declares that type. The loader records a version under the
 * first export path it reaches in sorted key order, which can be a collection
 * such as `documentModels`, so the named binding is found by identity against
 * the namespace of each selected source.
 */
export async function findCodeFirstDocumentModelExport(
  projectDir: string,
  documentModelId: string,
): Promise<CodeFirstDocumentModelExport | undefined> {
  const configFile = join(projectDir, POWERHOUSE_CONFIG_FILE);
  if (resolveCodeFirstSelection(configFile) === undefined) return undefined;
  return await readCodeFirstSources(
    configFile,
    async ({ documentModels, sourceSet }, importSource) => {
      const latest = firstBy(
        documentModels.filter(({ value }) => {
          const global: unknown = value.documentModel.global;
          return (
            isObjectType(global) &&
            "id" in global &&
            global.id === documentModelId
          );
        }),
        [({ value }) => value.version ?? 0, "desc"],
      );
      if (latest === undefined) return undefined;
      const specifiers = new Set([
        latest.source.specifier,
        ...sourceSet.sources.map(prop("specifier")),
      ]);
      let binding: CodeFirstDocumentModelExport["binding"];
      for (const specifier of specifiers) {
        const namespace = await importSource(specifier);
        const exportName = Object.keys(namespace)
          .filter(isImportableName)
          .sort()
          .find((key) => namespace[key] === latest.value);
        if (exportName !== undefined) {
          binding = { specifier, exportName };
          break;
        }
      }
      return {
        name: latest.value.documentModel.global.name,
        version: latest.value.version,
        specifier: latest.source.specifier,
        binding,
      };
    },
  );
}

function accessPath(alias: string, source: DefinitionSource): string {
  return (source.exportPath ?? []).reduce(
    (value, part) => `${value}[${JSON.stringify(part)}]`,
    alias,
  );
}

export function addCodeFirstExports(
  sourceFile: SourceFile,
  sources: CodeFirstAggregateSource[],
) {
  for (const [index, source] of sources.entries()) {
    if (source.documentModels.length === 0) continue;
    if (source.exportNamespace)
      sourceFile.addExportDeclaration({
        moduleSpecifier: source.moduleSpecifier,
      });
    const alias = `codeFirstSource${index}`;
    sourceFile.addImportDeclaration({
      namespaceImport: alias,
      moduleSpecifier: source.moduleSpecifier,
    });
    source.documentModels.forEach((model, modelIndex) => {
      sourceFile.addVariableStatement({
        isExported: true,
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
          {
            name: `codeFirstDocumentModel${index}_${modelIndex}`,
            initializer: accessPath(alias, model),
          },
        ],
      });
    });
  }
  if (sources.length > 0)
    sourceFile.addExportDeclaration({
      namedExports: ["documentModels"],
      moduleSpecifier: "./document-models.js",
    });
}

export function addCodeFirstCollections(
  collection: ArrayLiteralExpression,
  name: CollectionName,
  sources: CodeFirstAggregateSource[],
) {
  for (const [index, source] of sources.entries()) {
    if (source[name].length === 0) continue;
    const alias = `${name}CodeFirst${index}`;
    collection.getSourceFile().addImportDeclaration({
      namespaceImport: alias,
      moduleSpecifier: source.moduleSpecifier,
    });
    for (const artifact of source[name])
      collection.addElement(accessPath(alias, artifact));
  }
}
