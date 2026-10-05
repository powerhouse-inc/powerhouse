import { POWERHOUSE_CONFIG_FILE } from "@powerhousedao/shared/clis";
import { resolveDefinitionSelection } from "document-model/tooling";
import { join } from "node:path";
import type { ArrayLiteralExpression, SourceFile } from "ts-morph";

const MODELS_PREFIX = "./document-models/";

export function codeFirstModelImportSpecifiers(projectDir: string): string[] {
  const { sourceSet } = resolveDefinitionSelection({
    configFile: join(projectDir, POWERHOUSE_CONFIG_FILE),
  });
  return sourceSet.sources
    .map(({ specifier }) => specifier)
    .filter((specifier) => specifier.startsWith(MODELS_PREFIX))
    .map(importSpecifierFromModelsDir);
}

function importSpecifierFromModelsDir(sourceSpecifier: string) {
  const emitted = sourceSpecifier.replace(/\.(m?)ts$/, ".$1js");
  return `./${emitted.slice(MODELS_PREFIX.length)}`;
}

export function codeFirstModelDirectories(modules: string[]): Set<string> {
  return new Set(
    modules.flatMap((module) => {
      const segments = module.split("/").slice(1);
      return segments.length > 1 ? [segments[0]] : [];
    }),
  );
}

export function addCodeFirstExports(sourceFile: SourceFile, modules: string[]) {
  for (const moduleSpecifier of modules) {
    sourceFile.addExportDeclaration({ moduleSpecifier });
  }
  if (modules.length > 0) {
    sourceFile.addExportDeclaration({
      namedExports: ["documentModels"],
      moduleSpecifier: "./document-models.js",
    });
  }
}

export function addCodeFirstCollections(
  collection: ArrayLiteralExpression,
  collectionName: "documentModels" | "upgradeManifests",
  modules: string[],
) {
  for (const [index, moduleSpecifier] of modules.entries()) {
    const alias = `${collectionName}CodeFirst${index}`;
    collection.getSourceFile().addImportDeclaration({
      namedImports: [`${collectionName} as ${alias}`],
      moduleSpecifier,
    });
    collection.addElement(`...${alias}`);
  }
}
