import { POWERHOUSE_CONFIG_FILE } from "@powerhousedao/shared/clis";
import type { DefinitionSource } from "@powerhousedao/shared/clis/definition-sources";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  adaptCodeFirstDocumentModelSource,
  DefinitionSourceLoader,
  formatDefinitionDiagnostic,
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

export type CodeFirstInventory = {
  readonly projectDir: string;
  readonly sources: readonly DefinitionSource[];
  readonly sourceFiles: ReadonlyMap<string, DefinitionSource["specifier"]>;
  readonly documentModels: readonly CodeFirstModel[];
  readonly upgradeManifests: readonly {
    readonly documentType: string;
    readonly source: DefinitionSource;
  }[];
};

const DOCUMENT_MODEL_AGGREGATE_FILES = [
  "index.ts",
  "document-models.ts",
  "upgrade-manifests.ts",
] as const;

const isImportableName = (name: string) =>
  name !== "default" && /^[A-Za-z_$][\w$]*$/.test(name);

export async function loadCodeFirstInventory(
  projectDir: string,
): Promise<CodeFirstInventory> {
  const configFile = join(projectDir, POWERHOUSE_CONFIG_FILE);
  const importer = new ViteTypeScriptSourceImportAdapter();
  const loader = new DefinitionSourceLoader(importer);
  const packageRevision = uncachedDefinitionSourceRevision();
  const request = { configFile, allowMissingConfig: true };
  try {
    const selection = loader.resolve(request);
    if (selection.status === "skipped") {
      return {
        projectDir,
        sources: [],
        sourceFiles: new Map(),
        documentModels: [],
        upgradeManifests: [],
      };
    }
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
    if (loaded.status === "failed") {
      throw new Error(
        [
          `definitionSources in ${configFile} could not be loaded:`,
          ...loaded.diagnostics
            .filter(({ severity }) => severity === "error")
            .map(formatDefinitionDiagnostic),
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
      sources,
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

function refuseGeneratedAggregates(
  projectDir: string,
  sources: readonly DefinitionSource[],
) {
  const aggregates = new Set(
    DOCUMENT_MODEL_AGGREGATE_FILES.map((name) =>
      realPath(join(projectDir, "document-models", name)),
    ),
  );
  for (const { specifier } of sources) {
    if (aggregates.has(realPath(join(projectDir, specifier)))) {
      throw new Error(
        `definitionSources selects ${specifier}, which codegen generates. Select the authored definition file instead.`,
      );
    }
  }
}

const realPath = (path: string) =>
  existsSync(path) ? realpathSync.native(path) : path;
