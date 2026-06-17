import { camelCase, kebabCase, pascalCase } from "change-case";
import { createOrUpdateManifest } from "file-builders";
import path from "path";
import { filter, isTruthy, map, pipe, uniqueBy } from "remeda";
import {
  customSubgraphResolversTemplate,
  customSubgraphSchemaTemplate,
  subgraphIndexFileTemplate,
  subgraphLibFileTemplate,
} from "templates";
import type { Project } from "ts-morph";
import {
  ensureDirectoriesExist,
  formatSourceFileWithPrettier,
  getOrCreateDirectory,
  getOrCreateSourceFile,
} from "utils";

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
  const existingExportNames = pipe(
    sourceFile.getExportDeclarations(),
    map((exportDeclaration) =>
      exportDeclaration.getNamespaceExport()?.getName(),
    ),
    filter(isTruthy),
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
    filter(({ name }) => !existingExportNames.includes(name)),
    map(({ name, subgraphDir }) => ({
      namespaceExport: name,
      moduleSpecifier: `./${subgraphDir}/index.js`,
    })),
  );
  sourceFile.addExportDeclarations(exportDeclarations);
  await formatSourceFileWithPrettier(sourceFile);
}
