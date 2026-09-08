import { camelCase, kebabCase, pascalCase } from "change-case";
import { isGraphQLName } from "document-model/tooling";
import { join } from "node:path";
import {
  codeFirstSubgraphTemplate,
  codeFirstSubgraphTestTemplate,
  type CodeFirstSubgraphTemplateVariables,
} from "templates";
import type { Project } from "ts-morph";
import {
  ensureDirectoriesExist,
  formatSourceFileWithPrettier,
  getOrCreateDirectory,
  getOrCreateSourceFile,
  writeScaffoldFile,
} from "utils";
import { registerCodeFirstDefinitionSource } from "./definition-sources.js";
import { createOrUpdateManifest } from "./manifest.js";
import { makeSubgraphsIndexFile } from "./subgraphs.js";

function variables(subgraphName: string): CodeFirstSubgraphTemplateVariables {
  if (!/^[A-Za-z][A-Za-z0-9]*(?:[-_ ]?[A-Za-z0-9]+)*$/.test(subgraphName)) {
    throw new Error(
      "Code-first subgraph names must start with a letter and use single separators between alphanumeric words.",
    );
  }
  const kebabCaseName = kebabCase(subgraphName);
  const camelCaseName = camelCase(subgraphName);
  const pascalCaseName = pascalCase(subgraphName);
  if (
    !kebabCaseName ||
    !isGraphQLName(camelCaseName) ||
    !isGraphQLName(pascalCaseName)
  ) {
    throw new Error(
      "Code-first subgraph names must derive a valid GraphQL field and TypeScript export name.",
    );
  }
  return {
    camelCaseName,
    kebabCaseName,
    pascalCaseName,
  };
}

async function includeSubgraphInRootIndex(args: {
  project: Project;
  subgraphsDirPath: string;
  variables: CodeFirstSubgraphTemplateVariables;
}): Promise<void> {
  const { project, subgraphsDirPath, variables: v } = args;
  const indexFile = getOrCreateSourceFile(
    project,
    join(subgraphsDirPath, "index.ts"),
  ).sourceFile;
  const exportName = `${v.pascalCaseName}Subgraph`;
  const moduleSpecifier = `./${v.kebabCaseName}/index.js`;
  const exportDeclarations = indexFile.getExportDeclarations();
  const matchingNamespace = exportDeclarations.find(
    (declaration) =>
      declaration.getNamespaceExport()?.getName() === exportName &&
      declaration.getModuleSpecifierValue() === moduleSpecifier,
  );
  const matchingNamed = exportDeclarations.find(
    (declaration) =>
      declaration.getModuleSpecifierValue() === moduleSpecifier &&
      declaration
        .getNamedExports()
        .some(
          (specifier) =>
            (specifier.getAliasNode()?.getText() ?? specifier.getName()) ===
            exportName,
        ),
  );
  if (matchingNamespace || matchingNamed) return;

  const claimedByExportSyntax = exportDeclarations.some(
    (declaration) =>
      declaration.getNamespaceExport()?.getName() === exportName ||
      declaration
        .getNamedExports()
        .some(
          (specifier) =>
            (specifier.getAliasNode()?.getText() ?? specifier.getName()) ===
            exportName,
        ),
  );
  if (
    claimedByExportSyntax ||
    indexFile.getExportedDeclarations().has(exportName)
  ) {
    throw new Error(
      `Cannot export ${exportName}: subgraphs/index.ts already exports that name from another declaration.`,
    );
  }
  indexFile.addExportDeclaration({
    namespaceExport: exportName,
    moduleSpecifier,
  });
  await formatSourceFileWithPrettier(indexFile);
}

export async function tsMorphGenerateCodeFirstSubgraph(args: {
  subgraphName: string;
  project: Project;
}): Promise<void> {
  const { project, subgraphName } = args;
  const v = variables(subgraphName);
  const { directory: subgraphsDir } = getOrCreateDirectory(
    project,
    "subgraphs",
  );
  const subgraphsDirPath = subgraphsDir.getPath();
  const projectDir = subgraphsDir.getParentOrThrow().getPath();
  const subgraphDirPath = join(subgraphsDirPath, v.kebabCaseName);
  await ensureDirectoriesExist(project, subgraphDirPath);

  await writeScaffoldFile(
    project,
    join(subgraphDirPath, "index.ts"),
    codeFirstSubgraphTemplate(v),
  );
  await writeScaffoldFile(
    project,
    join(subgraphDirPath, "index.test.ts"),
    codeFirstSubgraphTestTemplate(v),
  );
  await includeSubgraphInRootIndex({
    project,
    subgraphsDirPath,
    variables: v,
  });
  await makeSubgraphsIndexFile({
    project,
    subgraphsDir: subgraphsDirPath,
  });
  await registerCodeFirstDefinitionSource(projectDir, {
    specifier: `./subgraphs/${v.kebabCaseName}/index.ts`,
    exportPath: [`${v.pascalCaseName}Subgraph`],
  });
  await createOrUpdateManifest(
    {
      subgraphs: [{ id: v.kebabCaseName, name: subgraphName }],
    },
    projectDir,
  );
}
