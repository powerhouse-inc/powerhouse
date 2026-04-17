import { fileExists } from "@powerhousedao/shared/clis";
import { type DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import type {
  ProcessorApp,
  ProcessorApps,
} from "@powerhousedao/shared/processors";
import { kebabCase } from "change-case";
import {
  tsMorphGenerateApp,
  tsMorphGenerateDocumentEditor,
  tsMorphGenerateDocumentModel,
  tsMorphGenerateSubgraph,
} from "file-builders";
import { readdir } from "node:fs/promises";
import path, { join } from "node:path";
import {
  conditional,
  filter,
  find,
  flatMap,
  isDefined,
  isEmpty,
  isIncludedIn,
  isString,
  isTruthy,
  map,
  pipe,
  split,
  startsWith,
  when,
} from "remeda";
import { SyntaxKind } from "ts-morph";
import { buildTsMorphProject, getObjectProperty } from "utils";
import { tsMorphGenerateProcessor } from "../file-builders/processors/processor.js";
import { loadDocumentModel } from "./utils.js";

export async function generateDocumentModel(
  documentModelState: DocumentModelGlobalState,
  projectDir: string,
) {
  await tsMorphGenerateDocumentModel(documentModelState, projectDir);
}
export async function generateAllDocumentModels(projectDir: string) {
  const files = await readdir(projectDir, { withFileTypes: true });
  const documentModelStates: DocumentModelGlobalState[] = [];

  for (const directory of files.filter((f) => f.isDirectory())) {
    const documentModelPath = path.join(
      projectDir,
      "document-models",
      directory.name,
      `${directory.name}.json`,
    );
    const pathExists = await fileExists(documentModelPath);
    if (!pathExists) {
      continue;
    }

    try {
      const documentModelState = await loadDocumentModel(documentModelPath);
      documentModelStates.push(documentModelState);

      await generateDocumentModel(documentModelState, projectDir);
    } catch (error) {
      console.error(directory.name, error);
    }
  }
}
export async function generateFromFile(filePath: string, projectDir: string) {
  // load document model spec from file
  const documentModelState = await loadDocumentModel(filePath);

  // delegate to shared generation function
  await generateDocumentModel(documentModelState, projectDir);
}

type GenerateEditorArgs = {
  editorName: string;
  documentTypes: string[];
  editorId?: string;
  editorDirName?: string;
};
export async function generateEditor(
  args: GenerateEditorArgs,
  projectDir = process.cwd(),
) {
  const {
    editorName,
    documentTypes,
    editorId: editorIdArg,
    editorDirName,
  } = args;

  if (documentTypes.length > 1) {
    throw new Error("Multiple document types are not supported yet");
  }

  const documentModelId = documentTypes[0];
  const editorId = editorIdArg || kebabCase(editorName);
  const editorDir = editorDirName || kebabCase(editorName);

  await tsMorphGenerateDocumentEditor({
    projectDir,
    editorDir,
    documentModelId,
    editorName,
    editorId,
  });
}

export async function generateAllEditors(projectDir = process.cwd()) {
  const project = buildTsMorphProject(projectDir);
  const editorsDirPath = path.join(projectDir, "editors");
  project.addSourceFilesAtPaths(path.join(editorsDirPath, "**/*"));

  const editorDirs =
    project.getDirectory(editorsDirPath)?.getDirectories() ?? [];

  const editorsToAdd = pipe(
    editorDirs,
    map((dir) => dir.getSourceFile("module.ts")),
    filter(isTruthy),
    map((sourceFile) =>
      sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAssignment),
    ),
    map((propertyAssignments) => ({
      id: find(
        propertyAssignments,
        (propertyAssignment) => propertyAssignment.getName() === "id",
      ),
      name: find(
        propertyAssignments,
        (propertyAssignment) => propertyAssignment.getName() === "name",
      ),
      documentTypes: find(
        propertyAssignments,
        (propertyAssignment) =>
          propertyAssignment.getName() === "documentTypes",
      ),
    })),
    map(({ id, name, documentTypes }) => ({
      editorDirName: id?.getSourceFile().getDirectory().getBaseName(),
      editorId: id
        ?.getFirstDescendantByKind(SyntaxKind.StringLiteral)
        ?.getLiteralValue(),
      editorName: name
        ?.getFirstDescendantByKind(SyntaxKind.StringLiteral)
        ?.getLiteralValue(),
      documentTypes: pipe(
        documentTypes
          ?.getFirstDescendantByKind(SyntaxKind.ArrayLiteralExpression)
          ?.getElements() ?? [],
        map((element) =>
          element.asKind(SyntaxKind.StringLiteral)?.getLiteralValue(),
        ),
        filter(isString),
      ),
    })),
    filter(
      ({ documentTypes }) =>
        !documentTypes.includes("powerhouse/document-drive"),
    ),
  );

  for (const editorToAdd of editorsToAdd) {
    if (editorToAdd.editorDirName === undefined) return;
    await generateEditor(editorToAdd as GenerateEditorArgs, projectDir);
  }
}

type GenerateAppArgs = {
  appName: string;
  appId?: string;
  allowedDocumentTypes?: string[];
  isDragAndDropEnabled?: boolean;
  appDirName?: string;
};
export async function generateApp(
  args: GenerateAppArgs,
  projectDir = process.cwd(),
) {
  const {
    appName,
    appId,
    allowedDocumentTypes,
    isDragAndDropEnabled,
    appDirName,
  } = args;

  await tsMorphGenerateApp({
    projectDir,
    editorDir: appDirName || kebabCase(appName),
    editorName: appName,
    editorId: appId ?? kebabCase(appName),
    allowedDocumentModelIds: allowedDocumentTypes ?? [],
    isDragAndDropEnabled: isDragAndDropEnabled ?? true,
  });
}

export async function generateAllApps(projectDir = process.cwd()) {
  const project = buildTsMorphProject(projectDir);
  const editorsDirPath = path.join(projectDir, "editors");
  project.addSourceFilesAtPaths(path.join(editorsDirPath, "**/*"));

  const editorDirs =
    project.getDirectory(editorsDirPath)?.getDirectories() ?? [];

  const appsToAdd = pipe(
    editorDirs,
    map((dir) => dir.getSourceFile("module.ts")),
    filter(isTruthy),
    map((sourceFile) =>
      sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAssignment),
    ),
    map((propertyAssignments) => ({
      id: find(
        propertyAssignments,
        (propertyAssignment) => propertyAssignment.getName() === "id",
      ),
      name: find(
        propertyAssignments,
        (propertyAssignment) => propertyAssignment.getName() === "name",
      ),
      documentTypes: find(
        propertyAssignments,
        (propertyAssignment) =>
          propertyAssignment.getName() === "documentTypes",
      ),
    })),
    map(({ id, name, documentTypes }) => ({
      appDir: id?.getSourceFile().getDirectory(),
      appId: id
        ?.getFirstDescendantByKind(SyntaxKind.StringLiteral)
        ?.getLiteralValue(),
      appName: name
        ?.getFirstDescendantByKind(SyntaxKind.StringLiteral)
        ?.getLiteralValue(),
      documentTypes: pipe(
        documentTypes
          ?.getFirstDescendantByKind(SyntaxKind.ArrayLiteralExpression)
          ?.getElements() ?? [],
        map((element) =>
          element.asKind(SyntaxKind.StringLiteral)?.getLiteralValue(),
        ),
        filter(isString),
      ),
    })),
    filter(({ documentTypes }) =>
      documentTypes.includes("powerhouse/document-drive"),
    ),
    map(({ appDir, ...rest }) => ({
      appDirName: appDir?.getBaseName(),
      configFilePropertyAssignments:
        appDir
          ?.getSourceFile("config.ts")
          ?.getDescendantsOfKind(SyntaxKind.PropertyAssignment) ?? [],
      ...rest,
    })),
    map(({ configFilePropertyAssignments, ...rest }) => ({
      isDragAndDropEnabled: find(
        configFilePropertyAssignments,
        (propertyAssignment) =>
          propertyAssignment.getName() === "isDragAndDropEnabled",
      ),
      allowedDocumentTypes: find(
        configFilePropertyAssignments,
        (propertyAssignment) =>
          propertyAssignment.getName() === "allowedDocumentTypes",
      ),
      ...rest,
    })),
    map(({ isDragAndDropEnabled, allowedDocumentTypes, ...rest }) => ({
      isDragAndDropEnabled: when(
        isDragAndDropEnabled?.getDescendants() ?? [],
        (descendants) =>
          isDefined(
            find(descendants, (d) => d.getKind() === SyntaxKind.TrueKeyword),
          ),
        {
          onTrue: () => true,
          onFalse: () => false,
        },
      ),
      allowedDocumentTypes: pipe(
        allowedDocumentTypes
          ?.getFirstDescendantByKind(SyntaxKind.ArrayLiteralExpression)
          ?.getElements() ?? [],
        map((element) =>
          element.asKind(SyntaxKind.StringLiteral)?.getLiteralValue(),
        ),
        filter(isString),
      ),
      ...rest,
    })),
  );

  for (const appToAdd of appsToAdd) {
    if (appToAdd.appName === undefined) return;

    await generateApp(appToAdd as GenerateAppArgs, projectDir);
  }
}
export async function generateSubgraph(
  subgraphName: string,
  documentModelFilePath: string | null,
  projectDir = process.cwd(),
) {
  const documentModelState =
    documentModelFilePath !== null
      ? await loadDocumentModel(documentModelFilePath)
      : null;
  await tsMorphGenerateSubgraph(
    {
      subgraphName,
      documentModel: documentModelState,
    },
    projectDir,
  );
}

export async function generateAllSubgraphs(projectDir: string) {
  const project = buildTsMorphProject(projectDir);
  const subgraphsDirPath = path.join(projectDir, "subgraphs");
  project.addSourceFilesAtPaths(path.join(subgraphsDirPath, "**/*"));
  const subgraphsDir = project.getDirectory(subgraphsDirPath);
  if (!subgraphsDir) return;
  const subgraphDirs = subgraphsDir.getDirectories();
  const subgraphInputs = pipe(
    subgraphDirs,
    map((dir) => ({
      resolversFile: dir.getSourceFile("resolvers.ts"),
      indexFile: dir.getSourceFile("index.ts"),
    })),
    map(({ resolversFile, indexFile }) => ({
      documentModelFilePath: pipe(
        resolversFile?.getImportDeclarations() ?? [],
        flatMap((importDeclarations) =>
          importDeclarations.getModuleSpecifier().getLiteralValue(),
        ),
        find((moduleSpecierLiteral) =>
          startsWith(moduleSpecierLiteral, "document-models/"),
        ),
        when(isString, (value) => split(value, "/").at(1)),
        when(isString, (value) =>
          join(projectDir, "document-models", value, `${value}.json`),
        ),
      ),
      subgraphName: pipe(
        indexFile?.getClasses() ?? [],
        find(
          (classDeclaration) =>
            classDeclaration
              .getBaseClass()
              ?.getText()
              .includes("BaseSubgraph") ?? false,
        ),
        (classDeclaration) =>
          classDeclaration
            ?.getInstanceProperty("name")
            ?.asKind(SyntaxKind.PropertyDeclaration)
            ?.getInitializerIfKind(SyntaxKind.StringLiteral)
            ?.getLiteralValue(),
      ),
    })),
  );
  for (const { subgraphName, documentModelFilePath } of subgraphInputs) {
    if (!subgraphName) continue;
    await generateSubgraph(
      subgraphName,
      documentModelFilePath ?? null,
      projectDir,
    );
  }
}

export async function generateProcessor(
  args: {
    processorName: string;
    processorType: "analytics" | "relationalDb";
    processorApps: ProcessorApps;
    documentTypes: string[];
  },
  projectDir = process.cwd(),
) {
  return await tsMorphGenerateProcessor({
    projectDir,
    ...args,
  });
}

export async function generateAllProcessors(projectDir = process.cwd()) {
  const project = buildTsMorphProject(projectDir);
  const processorsDirPath = path.join(projectDir, "processors");
  project.addSourceFilesAtPaths(path.join(processorsDirPath, "**/*"));
  const processorsDir = project.getDirectory(processorsDirPath);
  if (!processorsDir) return;
  const connectProcessorNames = pipe(
    processorsDir.getSourceFile("connect.ts"),
    (sourceFile) => sourceFile?.getImportDeclarations() ?? [],
    flatMap((importDeclaration) =>
      importDeclaration.getModuleSpecifier().getLiteralValue(),
    ),
    filter(startsWith("processors/")),
    map(split("/")),
    map((s) => s.at(1)),
    filter(isString),
  );
  const switchboardProcessorNames = pipe(
    processorsDir.getSourceFile("switchboard.ts"),
    (sourceFile) => sourceFile?.getImportDeclarations() ?? [],
    flatMap((importDeclaration) =>
      importDeclaration.getModuleSpecifier().getLiteralValue(),
    ),
    filter(startsWith("processors/")),
    map(split("/")),
    map((s) => s.at(1)),
    filter(isString),
  );
  const processorsToGenerate = pipe(
    processorsDir.getDirectories(),
    map((dir) => ({
      dir,
      processorName: dir.getBaseName(),
    })),
    map(({ dir, processorName }) => ({
      processorName,
      processorApps: pipe(
        [],
        when(
          () => isIncludedIn(processorName, connectProcessorNames),
          (processorApps) => [...processorApps, "connect"],
        ),
        when(
          () => isIncludedIn(processorName, switchboardProcessorNames),
          (processorApps) => [...processorApps, "switchboard"],
        ),
        when(
          (processorApps) => isEmpty(processorApps),
          () => ["connect", "switchboard"],
        ),
      ),
      processorType: pipe(
        dir.getSourceFile("processor.ts") ?? dir.getSourceFile("index.ts"),
        (sourceFile) => sourceFile?.getImportDeclarations() ?? [],
        flatMap((importDeclaration) => importDeclaration.getNamedImports()),
        map((importSpecifier) => importSpecifier.getText()),
        conditional(
          [
            (specifiers) =>
              isDefined(
                find(specifiers, (specifier) =>
                  specifier.includes("RelationalDbProcessor"),
                ),
              ),
            () => "relationalDb",
          ],
          [
            (specifiers) =>
              isDefined(
                find(specifiers, (specifier) =>
                  specifier.includes("IAnalyticsStore"),
                ),
              ),
            () => "analytics",
          ],
        ),
      ),
      documentTypes: pipe(
        dir.getSourceFile("factory.ts"),
        (sourceFile) =>
          sourceFile?.getDescendantsOfKind(
            SyntaxKind.ObjectLiteralExpression,
          ) ?? [],
        map((objectLiteralExpression) =>
          getObjectProperty(
            objectLiteralExpression,
            "documentType",
            SyntaxKind.ArrayLiteralExpression,
          ),
        ),
        flatMap((o) => o?.getElements()),
        map((e) => e?.asKind(SyntaxKind.StringLiteral)),
        filter(isTruthy),
        map((e) => e.getLiteralValue()),
      ),
    })),
  );

  for (const {
    processorName,
    processorApps,
    processorType,
    documentTypes,
  } of processorsToGenerate) {
    await generateProcessor(
      {
        processorName,
        processorApps: processorApps as ProcessorApp[],
        processorType: processorType as "analytics" | "relationalDb",
        documentTypes,
      },
      projectDir,
    );
  }
}

export async function generateAll(projectDir = process.cwd()) {
  await generateAllDocumentModels(projectDir);
  await generateAllEditors(projectDir);
  await generateAllApps(projectDir);
  await generateAllSubgraphs(projectDir);
  await generateAllProcessors(projectDir);
}
