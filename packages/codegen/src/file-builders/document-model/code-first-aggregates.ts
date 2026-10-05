import { POWERHOUSE_CONFIG_FILE } from "@powerhousedao/shared/clis";
import type {
  DefinitionSource,
  Sha256Digest,
} from "@powerhousedao/shared/document-model";
import {
  DefinitionSourceLoader,
  formatDefinitionDiagnostic,
  resolveDefinitionSelection,
} from "document-model/tooling";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
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

export async function codeFirstAggregateSources(
  projectDir: string,
): Promise<CodeFirstAggregateSource[]> {
  const configFile = join(projectDir, POWERHOUSE_CONFIG_FILE);
  if (!existsSync(configFile)) return [];
  const selection = resolveDefinitionSelection({ configFile });
  if (
    selection.status === "skipped" ||
    selection.reason === "sources-undeclared"
  )
    return [];
  if (selection.status === "failed")
    throw new Error(
      selection.diagnostics.map(formatDefinitionDiagnostic).join("\n"),
    );
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
  } finally {
    await loader.dispose();
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
