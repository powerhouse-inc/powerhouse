import type { PowerhouseModule } from "@powerhousedao/shared";
import { POWERHOUSE_CONFIG_FILE } from "@powerhousedao/shared/clis";
import { getConfigStrict } from "@powerhousedao/shared/clis/config-strict";
import { parseDefinitionSourcesConfig } from "@powerhousedao/shared/clis/definition-sources";
import type {
  DefinitionSource,
  Sha256Digest,
} from "@powerhousedao/shared/document-model";
import { kebabCase } from "change-case";
import {
  DefinitionSourceLoader,
  formatDefinitionDiagnostic,
  resolveDefinitionSelection,
  type DefinitionSourceResolution,
  type LoadedDefinition,
  type LoadedDefinitionSet,
  type SubgraphClass,
} from "document-model/tooling";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { isObjectType, isString, prop, uniqueBy } from "remeda";
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

function resolveCodeFirstSelection(
  configFile: string,
): DefinitionSourceResolution | undefined {
  if (!existsSync(configFile)) return undefined;
  const selection = resolveDefinitionSelection({ configFile });
  if (
    selection.status === "skipped" ||
    selection.reason === "sources-undeclared"
  )
    return undefined;
  if (selection.status === "failed")
    throw new Error(
      selection.diagnostics.map(formatDefinitionDiagnostic).join("\n"),
    );
  return selection;
}

async function readCodeFirstSources<T>(
  configFile: string,
  read: (loaded: LoadedDefinitionSet) => T,
): Promise<T> {
  const loader = new DefinitionSourceLoader(
    new ViteTypeScriptSourceImportAdapter(),
  );
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
    return read(loaded);
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
          const emitted = specifier.replace(/\.(m?)ts$/, ".$1js");
          const path = relative(
            join(projectDir, "document-models"),
            resolve(projectDir, emitted),
          ).replaceAll("\\", "/");
          source = {
            moduleSpecifier: path.startsWith(".") ? path : `./${path}`,
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

function selectsEmptyEntryList(configFile: string) {
  const parsed = parseDefinitionSourcesConfig(
    getConfigStrict(configFile).definitionSources,
  );
  return !parsed.ok && parsed.reason === "empty";
}

/**
 * The manifest entries for every model and subgraph the package's code-first
 * sources compile to. Identity comes from the compiled values, not from where
 * the sources live. An empty code-first `entries` list selects nothing, so it
 * is `none`. `unavailable` carries the diagnostics or error of any other
 * selection or source that cannot be loaded, and names the source of a model
 * or subgraph without an id or a name.
 */
export async function loadCodeFirstInventory(
  projectDir: string,
): Promise<CodeFirstInventory> {
  const configFile = join(projectDir, POWERHOUSE_CONFIG_FILE);
  try {
    if (
      !existsSync(configFile) ||
      selectsEmptyEntryList(configFile) ||
      resolveCodeFirstSelection(configFile) === undefined
    )
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
