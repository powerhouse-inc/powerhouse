import { camelCase, kebabCase, pascalCase } from "change-case";
import type { CodeFirstGenerationResult } from "file-builders";
import { createOrUpdateManifest } from "file-builders";
import { existsSync } from "node:fs";
import path from "path";
import { filter, isTruthy, map, pipe, uniqueBy } from "remeda";
import {
  codeFirstSubgraphTemplate,
  customSubgraphResolversTemplate,
  customSubgraphSchemaTemplate,
  subgraphIndexFileTemplate,
  subgraphLibFileTemplate,
} from "templates";
import type { Project, SourceFile } from "ts-morph";
import {
  ensureDirectoriesExist,
  formatSourceFileWithPrettier,
  getOrCreateDirectory,
  getOrCreateSourceFile,
} from "utils";
import { planDefinitionSourceRegistration } from "./definition-sources.js";

export async function tsMorphGenerateSubgraph(args: {
  subgraphName: string;
  project: Project;
}): Promise<void> {
  const { subgraphName, project } = args;
  const kebabCaseName = kebabCase(subgraphName);
  const pascalCaseName = pascalCase(subgraphName);
  const camelCaseName = camelCase(subgraphName);
  const { directory: subgraphsDir } = getOrCreateDirectory(
    project,
    "subgraphs",
  );
  const subgraphsDirPath = subgraphsDir.getPath();
  const projectDir = subgraphsDir.getParentOrThrow().getPath();
  const subgraphDir = path.join(subgraphsDirPath, kebabCaseName);
  await ensureDirectoriesExist(project, subgraphsDirPath, subgraphDir);

  // Always generate base subgraph files (unless_exists)
  await makeBaseSubgraphIndexFile(project, subgraphDir, {
    pascalCaseName,
    kebabCaseName,
  });
  await makeBaseSubgraphLibFile(project, subgraphDir);

  // Generate custom subgraph scaffolds (unless_exists)
  await makeCustomSubgraphFiles(project, subgraphDir, {
    pascalCaseName,
    camelCaseName,
  });

  await makeSubgraphsIndexFile({ project, subgraphsDir: subgraphsDirPath });
  await createOrUpdateManifest(
    {
      subgraphs: [
        {
          name: subgraphName,
          id: kebabCaseName,
        },
      ],
    },
    projectDir,
  );
}

async function makeBaseSubgraphIndexFile(
  project: Project,
  dirPath: string,
  v: { pascalCaseName: string; kebabCaseName: string },
) {
  const filePath = path.join(dirPath, "index.ts");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );
  if (alreadyExists) return;
  sourceFile.replaceWithText(subgraphIndexFileTemplate(v));
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeBaseSubgraphLibFile(project: Project, dirPath: string) {
  const filePath = path.join(dirPath, "lib.ts");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );
  if (alreadyExists) return;
  sourceFile.replaceWithText(subgraphLibFileTemplate());
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeCustomSubgraphFiles(
  project: Project,
  dirPath: string,
  v: { pascalCaseName: string; camelCaseName: string },
) {
  // Schema — skip prettier, contains gql tagged template literal
  const schemaPath = path.join(dirPath, "schema.ts");
  const schema = getOrCreateSourceFile(project, schemaPath);
  if (!schema.alreadyExists) {
    schema.sourceFile.replaceWithText(customSubgraphSchemaTemplate(v));
  }

  // Resolvers
  const resolversPath = path.join(dirPath, "resolvers.ts");
  const resolvers = getOrCreateSourceFile(project, resolversPath);
  if (!resolvers.alreadyExists) {
    resolvers.sourceFile.replaceWithText(customSubgraphResolversTemplate(v));
    await formatSourceFileWithPrettier(resolvers.sourceFile);
  }
}

export async function makeSubgraphsIndexFile(args: {
  project: Project;
  subgraphsDir: string;
}) {
  const { project, subgraphsDir } = args;
  // skipAddingFilesFromTsConfig leaves other subgraphs out of the project; add
  // their index files so the aggregate exports every subgraph, not just the new one.
  project.addSourceFilesAtPaths(path.join(subgraphsDir, "**", "index.ts"));
  const { sourceFile } = getOrCreateSourceFile(
    project,
    path.join(subgraphsDir, "index.ts"),
  );

  const exportDeclarations = pipe(
    project.getDirectoryOrThrow(subgraphsDir).getDescendantSourceFiles(),
    filter((sourceFile) => sourceFile.getBaseName() === "index.ts"),
    uniqueBy((sourceFile) => sourceFile.getFilePath()),
    map((sourceFile) =>
      sourceFile
        .getClasses()
        .find((c) => c.getBaseClass()?.getText().includes("BaseSubgraph")),
    ),
    filter(isTruthy),
    map((classDeclaration) => ({
      name: classDeclaration.getNameOrThrow(),
      subgraphDir: classDeclaration
        .getSourceFile()
        .getDirectory()
        .getBaseName(),
    })),
    map(({ name, subgraphDir }) => ({
      namespaceExport: name,
      moduleSpecifier: `./${subgraphDir}/index.js`,
    })),
  );
  addMissingNamespaceExports(sourceFile, exportDeclarations);
  await formatSourceFileWithPrettier(sourceFile);
}

function addMissingNamespaceExports(
  sourceFile: SourceFile,
  exportDeclarations: { namespaceExport: string; moduleSpecifier: string }[],
) {
  const existingExportNames = sourceFile
    .getExportDeclarations()
    .map((exportDeclaration) =>
      exportDeclaration.getNamespaceExport()?.getName(),
    );
  sourceFile.addExportDeclarations(
    exportDeclarations.filter(
      ({ namespaceExport }) => !existingExportNames.includes(namespaceExport),
    ),
  );
}

/**
 * Writes a code-first subgraph declaration, then registers it in
 * `definitionSources`, so a failed write leaves the config untouched. Exports
 * it from `subgraphs/index.ts` under the name of its inner constant, in the
 * project for the caller to save. Refuses to overwrite an existing
 * declaration.
 */
export async function tsMorphGenerateCodeFirstSubgraph(args: {
  subgraphName: string;
  project: Project;
}): Promise<CodeFirstGenerationResult> {
  const { subgraphName, project } = args;
  const kebabCaseName = kebabCase(subgraphName);
  const pascalCaseName = pascalCase(subgraphName);
  const exportName = `${pascalCaseName}Subgraph`;
  const { directory: subgraphsDir } = getOrCreateDirectory(
    project,
    "subgraphs",
  );
  const subgraphsDirPath = subgraphsDir.getPath();
  const projectDir = subgraphsDir.getParentOrThrow().getPath();
  const declarationPath = `subgraphs/${kebabCaseName}.ts`;
  if (existsSync(path.join(projectDir, declarationPath))) {
    throw new Error(
      `Refusing to overwrite ${declarationPath}. Delete it, or choose another name.`,
    );
  }

  const { registration, commit } = await planDefinitionSourceRegistration(
    projectDir,
    { specifier: `./${declarationPath}` },
  );
  const declaration = getOrCreateSourceFile(
    project,
    path.join(projectDir, declarationPath),
  ).sourceFile;
  declaration.replaceWithText(
    codeFirstSubgraphTemplate({
      name: subgraphName,
      exportName,
      pascalCaseName,
      camelCaseName: camelCase(subgraphName),
      kebabCaseName,
    }),
  );
  await formatSourceFileWithPrettier(declaration);
  await declaration.save();
  await commit();

  const index = getOrCreateSourceFile(
    project,
    path.join(subgraphsDirPath, "index.ts"),
  ).sourceFile;
  addMissingNamespaceExports(index, [
    {
      namespaceExport: exportName,
      moduleSpecifier: `./${kebabCaseName}.js`,
    },
  ]);
  await formatSourceFileWithPrettier(index);

  return { written: [declarationPath, "subgraphs/index.ts"], registration };
}
