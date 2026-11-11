import { POWERHOUSE_CONFIG_FILE } from "@powerhousedao/shared/clis";
import type { DefinitionSource } from "@powerhousedao/shared/clis/definition-sources";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  adaptCodeFirstDocumentModelSource,
  DefinitionSourceLoader,
  type DocumentModelDirectory,
  formatDefinitionDiagnostic,
  findUnregisteredDefinitions,
  unregisteredDefinitionDiagnostics,
  type LoadedDefinition,
} from "document-model/tooling";
import { pascalCase } from "change-case";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { unique } from "remeda";
import {
  uncachedDefinitionSourceRevision,
  ViteTypeScriptSourceImportAdapter,
} from "../../utils/definition-source-importer.js";

export type CodeFirstBinding = {
  readonly specifier: `./${string}`;
  readonly exportName: string;
};

export type CodeFirstModel = {
  readonly documentType: string;
  readonly name: string;
  readonly version: number;
  readonly aggregateExportName: string;

  readonly source: DefinitionSource;
  readonly binding: CodeFirstBinding | undefined;
};

/**
 * Every document model of a package, read through discovery: the classified
 * model directories, and the code-first models their entry modules export.
 * Schema-first models stay files on disk; generation reads their stored
 * specifications itself.
 */
export type DocumentModelInventory = {
  readonly projectDir: string;
  /** Absolute: the configured directory discovery read. */
  readonly documentModelsDir: string;
  readonly directories: readonly DocumentModelDirectory[];
  readonly sources: readonly DefinitionSource[];
  /**
   * The entry modules that export a model or an upgrade manifest. An entry
   * that re-exports another entry's is one of them, though `documentModels`
   * and `upgradeManifests` name each value under its first entry only.
   */
  readonly codeFirstEntries: readonly DefinitionSource["specifier"][];
  readonly sourceFiles: ReadonlyMap<string, DefinitionSource["specifier"]>;
  readonly documentModels: readonly CodeFirstModel[];
  readonly upgradeManifests: readonly {
    readonly documentType: string;
    readonly source: DefinitionSource;
  }[];
};

/** Where codegen writes the generated barrels, whatever `documentModelsDir` is. */
export function canonicalDocumentModelsDir(projectDir: string): string {
  return join(projectDir, "document-models");
}

const isImportableName = (name: string) =>
  name !== "default" && /^[A-Za-z_$][\w$]*$/.test(name);

/**
 * Discovers the package's model directories and loads every code-first
 * entry module. Throws, before anything is written, when discovery or a
 * load fails, so no caller prunes or rewrites from a partial inventory.
 */
export async function loadDocumentModelInventory(
  projectDir: string,
): Promise<DocumentModelInventory> {
  const configFile = join(projectDir, POWERHOUSE_CONFIG_FILE);
  const importer = new ViteTypeScriptSourceImportAdapter();
  const loader = new DefinitionSourceLoader(importer);
  const packageRevision = uncachedDefinitionSourceRevision();
  const request = { configFile, allowMissingConfig: true };
  try {
    const selection = loader.resolve(request);
    if (selection.status === "ready") {
      refuseGeneratedAggregates(projectDir, selection.sourceSet.sources);
    }
    const loaded = await loader.normalizeDefinitionSources({
      ...request,
      packageRevision,
    });
    for (const diagnostic of loaded.diagnostics) {
      if (diagnostic.severity !== "error") {
        console.warn(`⚠ ${formatDefinitionDiagnostic(diagnostic)}`);
      }
    }
    if (loaded.status === "failed" || loaded.documentModelsDir === undefined) {
      throw new Error(
        [
          `The document models of ${projectDir} could not be loaded, so nothing was generated:`,
          ...loaded.diagnostics
            .filter(({ severity }) => severity === "error")
            .map(formatDefinitionDiagnostic),
        ].join("\n"),
      );
    }
    const { documentModelsDir, directories = [] } = loaded;

    const scan = findUnregisteredDefinitions({
      packageRoot: loaded.packageRoot,
      documentModelsDir,
      sources: loaded.sourceSet.sources,
      importedFiles: (specifier) => importer.filesImportedBy(specifier),
      loadedDocumentTypes: new Set(
        loaded.documentModels.map(({ value }) => value.documentModel.global.id),
      ),
      storedUnits: new Set(
        loaded.sourceSet.stored.map(({ specifier }) =>
          specifier.replace(/[^/]+$/, ""),
        ),
      ),
    });
    const scanErrors = [
      ...scan.diagnostics,
      ...unregisteredDefinitionDiagnostics(scan.unregistered),
    ];
    if (scanErrors.length > 0) {
      throw new Error(
        [
          `The document models of ${projectDir} could not be loaded, so nothing was generated:`,
          ...scanErrors.map(formatDefinitionDiagnostic),
        ].join("\n"),
      );
    }

    const { sources } = loaded.sourceSet;
    const bindings = new Map<unknown, CodeFirstBinding>();
    const specifiers = unique([
      ...loaded.documentModels.map(({ source }) => source.specifier),
      ...sources.map(({ specifier }) => specifier),
    ]);
    for (const specifier of specifiers) {
      const namespace = await importer.importModule({
        packageRoot: loaded.packageRoot,
        specifier,
        packageRevision,
      });
      for (const exportName of Object.keys(namespace)
        .filter(isImportableName)
        .sort()) {
        if (!bindings.has(namespace[exportName])) {
          bindings.set(namespace[exportName], { specifier, exportName });
        }
      }
    }

    const documentModels = loaded.documentModels.map((loadedModel) => ({
      ...identityOf(loadedModel),
      source: loadedModel.source,
      binding: bindings.get(loadedModel.value),
    }));
    const names = new Map<string, string>();
    for (const model of documentModels) {
      const previous = names.get(model.aggregateExportName);
      if (previous !== undefined) {
        throw new Error(
          `Code-first sources ${previous} and ${model.source.specifier} both export ${model.aggregateExportName} from document-models/index.ts. Choose distinct model names before generating.`,
        );
      }
      names.set(model.aggregateExportName, model.source.specifier);
    }
    return {
      projectDir,
      documentModelsDir,
      directories,
      sources,
      codeFirstEntries: loaded.sourcesWithDefinitions.map(
        ({ specifier }) => specifier,
      ),
      sourceFiles: new Map(
        specifiers.flatMap((specifier) =>
          importer
            .filesImportedBy(specifier)
            .map((file) => [file, specifier] as const),
        ),
      ),
      documentModels,
      upgradeManifests: loaded.upgradeManifests.map(({ source, value }) => ({
        documentType: value.documentType,
        source,
      })),
    };
  } finally {
    await loader.dispose();
  }
}

const AGGREGATE_FILES = [
  "index.ts",
  "document-models.ts",
  "upgrade-manifests.ts",
] as const;

const realPath = (path: string) =>
  existsSync(path) ? realpathSync.native(path) : path;

/**
 * Discovery never lists the barrels, but a model directory's entry can be a
 * symlink to one. Loading it would make generation read its own output.
 */
function refuseGeneratedAggregates(
  projectDir: string,
  sources: readonly DefinitionSource[],
) {
  const aggregates = new Set(
    AGGREGATE_FILES.map((name) =>
      realPath(join(canonicalDocumentModelsDir(projectDir), name)),
    ),
  );
  for (const { specifier } of sources) {
    if (aggregates.has(realPath(join(projectDir, specifier)))) {
      throw new Error(
        `${specifier} resolves to a barrel codegen generates. Give that model directory an authored index.ts instead.`,
      );
    }
  }
}

function identityOf({ source, value }: LoadedDefinition<DocumentModelModule>) {
  const result = adaptCodeFirstDocumentModelSource(value, source);
  const artifact = result.artifacts.at(0);
  if (
    artifact === undefined ||
    result.diagnostics.some(({ severity }) => severity === "error")
  ) {
    throw new Error(
      [
        `${source.specifier} does not export a valid code-first definition:`,
        ...result.diagnostics.map(formatDefinitionDiagnostic),
      ].join("\n"),
    );
  }
  return {
    documentType: artifact.documentType,
    name: artifact.definition.model.name,
    version: artifact.version,
    aggregateExportName: `${pascalCase(artifact.definition.model.name)}V${artifact.version}`,
  };
}
