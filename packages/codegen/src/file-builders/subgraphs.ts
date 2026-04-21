import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import { camelCase, kebabCase, pascalCase } from "change-case";
import { createOrUpdateManifest } from "file-builders";
import path from "path";
import { filter, isTruthy, map, pipe, uniqueBy } from "remeda";
import {
  customSubgraphResolversTemplate,
  customSubgraphSchemaTemplate,
  documentModelSubgraphResolversTemplate,
  documentModelSubgraphSchemaTemplate,
  subgraphIndexFileTemplate,
  subgraphLibFileTemplate,
} from "templates";
import type { Project } from "ts-morph";
import {
  applyGraphQLTypePrefixes,
  ensureDirectoriesExist,
  extractTypeNames,
  formatSourceFileWithPrettier,
  getOrCreateDirectory,
  getOrCreateSourceFile,
} from "utils";

type TsMorphGenerateSubgraphArgs = {
  subgraphName: string;
  documentModel: DocumentModelGlobalState | null;
};

export async function tsMorphGenerateSubgraph(
  args: TsMorphGenerateSubgraphArgs,
  project: Project,
): Promise<void> {
  const { subgraphName, documentModel } = args;
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

  if (documentModel !== null) {
    // Generate document-model-specific schema and resolvers (force overwrite)
    await makeDocumentModelSubgraphFiles(project, subgraphDir, documentModel);
  } else {
    // Generate custom subgraph scaffolds (unless_exists)
    await makeCustomSubgraphFiles(project, subgraphDir, {
      pascalCaseName,
      camelCaseName,
    });
  }

  await makeSubgraphsIndexFile({ project, subgraphsDir: subgraphsDirPath });
  await project.save();
  await createOrUpdateManifest(
    {
      subgraphs: [
        {
          name: subgraphName,
          id: kebabCaseName,
          documentTypes: documentModel?.id ? [documentModel.id] : [],
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

async function makeDocumentModelSubgraphFiles(
  project: Project,
  dirPath: string,
  documentModel: DocumentModelGlobalState,
) {
  const latestSpec =
    documentModel.specifications[documentModel.specifications.length - 1];
  const documentType = documentModel.name;
  const pascalCaseDocumentType = pascalCase(documentType);
  const camelCaseDocumentType = camelCase(documentType);
  const phDocumentTypeName = `${pascalCaseDocumentType}Document`;
  const documentTypeVariableName = `${camelCaseDocumentType}DocumentType`;
  const kebabCaseDocumentType = kebabCase(documentType);
  const documentModelDir = `document-models/${kebabCaseDocumentType}`;

  const stateSchema = latestSpec.state.global.schema;
  const stateTypeNames = extractTypeNames(stateSchema);

  const modulesWithSchemaTypePrefixes = latestSpec.modules
    .filter((m): m is typeof m & { name: string } => m.name !== null)
    .map((m) => ({
      name: kebabCase(m.name),
      operations: m.operations
        .filter((op): op is typeof op & { name: string } => op.name !== null)
        .map((op) => ({
          name: op.name,
          schema: applyGraphQLTypePrefixes(
            op.schema ?? "",
            pascalCaseDocumentType,
            stateTypeNames,
          ),
        })),
    }));

  // Schema (force overwrite) — skip prettier, contains gql tagged template literal
  const schemaPath = path.join(dirPath, "schema.ts");
  const schema = getOrCreateSourceFile(project, schemaPath);
  schema.sourceFile.replaceWithText(
    documentModelSubgraphSchemaTemplate({
      pascalCaseDocumentType,
      modulesWithSchemaTypePrefixes,
    }),
  );

  // Resolvers (force overwrite) — skip prettier, contains template literals that confuse parser
  const resolversPath = path.join(dirPath, "resolvers.ts");
  const resolvers = getOrCreateSourceFile(project, resolversPath);
  resolvers.sourceFile.replaceWithText(
    documentModelSubgraphResolversTemplate({
      pascalCaseDocumentType,
      camelCaseDocumentType,
      phDocumentTypeName,
      documentTypeVariableName,
      documentModelDir,
      modulesWithSchemaTypePrefixes,
    }),
  );
}

export async function makeSubgraphsIndexFile(args: {
  project: Project;
  subgraphsDir: string;
}) {
  const { project, subgraphsDir } = args;
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
  await project.save();
}
