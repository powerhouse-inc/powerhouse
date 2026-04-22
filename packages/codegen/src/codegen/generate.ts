import {
  DocumentModelGlobalStateSchema,
  type DocumentModelGlobalState,
} from "@powerhousedao/shared/document-model";
import type {
  ProcessorApp,
  ProcessorApps,
} from "@powerhousedao/shared/processors";
import { kebabCase } from "change-case";
import {
  tsMorphGenerateApp,
  tsMorphGenerateDocumentEditor,
  tsMorphGenerateDocumentModel,
  tsMorphGenerateProcessor,
  tsMorphGenerateSubgraph,
} from "file-builders";
import { loadJsonFileSync } from "load-json-file";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
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
import type { Project } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { getObjectProperty, getOrCreateDirectory } from "utils";
import { loadDocumentModel } from "./utils.js";

export async function generateDocumentModel(
  documentModelState: DocumentModelGlobalState,
  project: Project,
) {
  await tsMorphGenerateDocumentModel(documentModelState, project);
}

/* Runs generate for each document model json file found in the project's `document-models` directory  */
export async function generateAllDocumentModels(project: Project) {
  const { directory: documentModelsDir } = getOrCreateDirectory(
    project,
    "document-models",
  );
  const documentModelsDirPath = documentModelsDir.getPath();
  const documentModelStateFiles = pipe(
    readdirSync(documentModelsDirPath, { withFileTypes: true }),
    filter((dirent) => dirent.isDirectory()),
    map((dir) => join(dir.parentPath, `${dir.name}/${dir.name}.json`)),
    filter(
      (srcPath) =>
        statSync(srcPath, { throwIfNoEntry: false })?.isFile() ?? false,
    ),
    map((srcPath) => loadJsonFileSync(srcPath)),
    filter(
      (stateFile): stateFile is DocumentModelGlobalState =>
        DocumentModelGlobalStateSchema().safeParse(stateFile).success === true,
    ),
  );

  for (const documentModelState of documentModelStateFiles) {
    await generateDocumentModel(documentModelState, project);
  }
}
export async function generateFromFile(filePath: string, project: Project) {
  // load document model spec from file
  const documentModelState = await loadDocumentModel(filePath);

  // delegate to shared generation function
  await generateDocumentModel(documentModelState, project);
}

type GenerateEditorArgs = {
  editorName: string;
  documentTypes: string[];
  editorId?: string;
  editorDirName?: string;
};
export async function generateEditor(
  args: GenerateEditorArgs,
  project: Project,
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
    project,
    editorDir,
    documentModelId,
    editorName,
    editorId,
  });
}

/* Runs generate for all editors found in the project's `editors` directory.
 * Note: we intentionally filter out editors with the document type "powerhouse/document-drive".
 * These are handled separately by the `generateAllApps` function.
 */
export async function generateAllEditors(project: Project) {
  const { directory: editorsDir } = getOrCreateDirectory(project, "editors");
  const editorDirs = editorsDir.getDirectories();

  /* An editor's `id`, `name`, and `documentTypes` args can be found in the `module.ts` file */
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
    await generateEditor(editorToAdd as GenerateEditorArgs, project);
  }
}

type GenerateAppArgs = {
  appName: string;
  appId?: string;
  allowedDocumentTypes?: string[];
  isDragAndDropEnabled?: boolean;
  appDirName?: string;
};
export async function generateApp(args: GenerateAppArgs, project: Project) {
  const {
    appName,
    appId,
    allowedDocumentTypes,
    isDragAndDropEnabled,
    appDirName,
  } = args;

  await tsMorphGenerateApp({
    project,
    editorDir: appDirName || kebabCase(appName),
    editorName: appName,
    editorId: appId ?? kebabCase(appName),
    allowedDocumentModelIds: allowedDocumentTypes ?? [],
    isDragAndDropEnabled: isDragAndDropEnabled ?? true,
  });
}

/* Runs generate for all apps found in the project's `editors` directory.
 * Note: we intentionally filter out editors which do not have the document type "powerhouse/document-drive".
 * These are handled separately by the `generateAllEditors` function.
 */
export async function generateAllApps(project: Project) {
  const { directory: editorsDir } = getOrCreateDirectory(project, "editors");
  const editorDirs = editorsDir.getDirectories();

  /* An editor's `id`, `name`, and `documentTypes` args can be found in the `module.ts` file */
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
    /* The `allowedDocumentTypes` and `isDragAndDropEnabled` args can only be found in the `config.ts` file */
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

    await generateApp(appToAdd as GenerateAppArgs, project);
  }
}
export async function generateSubgraph(
  subgraphName: string,
  documentModelFilePath: string | null,
  project: Project,
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
    project,
  );
}

/* Runs generate for each directory found in the project's `subgraphs` directory  */
export async function generateAllSubgraphs(project: Project) {
  const { directory: subgraphsDir } = getOrCreateDirectory(
    project,
    "subgraphs",
  );
  const { directory: documentModelsDir } = getOrCreateDirectory(
    project,
    "document-models",
  );
  const documentModelsDirPath = documentModelsDir.getPath();
  const subgraphDirs = subgraphsDir.getDirectories();
  /* The subgraph's name is found in the `index.ts` file */
  /* The only reliable way to get the subgraph's `documentTypes` is by looking at what is imported by `resolvers.ts` */
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
          join(documentModelsDirPath, value, `${value}.json`),
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
      project,
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
  project: Project,
) {
  return await tsMorphGenerateProcessor({
    project,
    ...args,
  });
}

/* Runs generate for each directory found in the project's `processors` directory  */
export async function generateAllProcessors(project: Project) {
  const { directory: processorsDir } = getOrCreateDirectory(
    project,
    "processors",
  );
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
      /* We can try to determine which processors are for `connect` and for `switchboard`.
       * If we cannot, we fallback to including them in both. */
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
        // handle the old `index.ts` file name if `processor.ts` has not been generated
        dir.getSourceFile("processor.ts") ?? dir.getSourceFile("index.ts"),
        (sourceFile) => sourceFile?.getImportDeclarations() ?? [],
        flatMap((importDeclaration) => importDeclaration.getNamedImports()),
        map((importSpecifier) => importSpecifier.getText()),
        // we have to check what type is imported to determine whether the processor is `relationalDb` or `analytics`
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
      project,
    );
  }
}

/* Runs each module type's generateAll{moduleType} function for the current project */
export async function generateAll(project: Project) {
  await generateAllDocumentModels(project);
  await generateAllEditors(project);
  await generateAllApps(project);
  await generateAllSubgraphs(project);
  await generateAllProcessors(project);
}
