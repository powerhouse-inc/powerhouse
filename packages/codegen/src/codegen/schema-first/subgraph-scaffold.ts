import { camelCase, kebabCase, pascalCase } from "change-case";
import path from "path";
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
import { registerSubgraph } from "../../file-builders/subgraph-registration.js";

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

  await registerSubgraph({
    project,
    subgraphsDir: subgraphsDirPath,
    subgraph: { name: subgraphName, id: kebabCaseName },
  });
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
  const schemaPath = path.join(dirPath, "schema.ts");
  const schema = getOrCreateSourceFile(project, schemaPath);
  if (!schema.alreadyExists) {
    schema.sourceFile.replaceWithText(customSubgraphSchemaTemplate(v));
    await formatSourceFileWithPrettier(schema.sourceFile);
  }

  // Resolvers
  const resolversPath = path.join(dirPath, "resolvers.ts");
  const resolvers = getOrCreateSourceFile(project, resolversPath);
  if (!resolvers.alreadyExists) {
    resolvers.sourceFile.replaceWithText(customSubgraphResolversTemplate(v));
    await formatSourceFileWithPrettier(resolvers.sourceFile);
  }
}
