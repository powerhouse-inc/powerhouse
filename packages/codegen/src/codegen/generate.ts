import { fileExists } from "@powerhousedao/shared/clis";
import { type DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import type { ProcessorApps } from "@powerhousedao/shared/processors";
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
  filter,
  find,
  flatMap,
  isString,
  isTruthy,
  map,
  pipe,
  split,
  startsWith,
  when,
} from "remeda";
import { SyntaxKind } from "ts-morph";
import {
  buildTsMorphProject,
  getObjectLiteral,
  getObjectProperty,
  getVariableDeclarationByTypeName,
} from "utils";
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

export async function generateApp(
  options: {
    appName: string;
    appId?: string;
    allowedDocumentTypes?: string[];
    isDragAndDropEnabled?: boolean;
    appDirName?: string;
  },
  projectDir = process.cwd(),
) {
  const {
    appName,
    appId,
    allowedDocumentTypes,
    isDragAndDropEnabled,
    appDirName,
  } = options;

  await tsMorphGenerateApp({
    projectDir,
    editorDir: appDirName || kebabCase(appName),
    editorName: appName,
    editorId: appId ?? kebabCase(appName),
    allowedDocumentModelIds: allowedDocumentTypes ?? [],
    isDragAndDropEnabled: isDragAndDropEnabled ?? true,
  });
}

export async function generateAllEditorsAndApps(projectDir: string) {
  const project = buildTsMorphProject(projectDir);
  const editorsDir = path.join(projectDir, "editors");
  project.addSourceFilesAtPaths(path.join(editorsDir, "**/*"));
  const editorDirs = pipe(
    await readdir(editorsDir, { withFileTypes: true }),
    filter((fileOrDir) => fileOrDir.isDirectory()),
    map((dir) => dir.name),
  );
  const editorConfigs = pipe(
    editorDirs,
    map((editorDir) =>
      project.getSourceFile(path.join(editorsDir, editorDir, "module.ts")),
    ),
    filter(isTruthy),
    map((sourceFile) =>
      sourceFile.getVariableStatement(
        getVariableDeclarationByTypeName(
          sourceFile,
          "EditorModule",
        )?.getName() ?? "",
      ),
    ),
    map(getObjectLiteral),
    filter(isTruthy),
    map((literal) => ({
      config: getObjectProperty(
        literal,
        "config",
        SyntaxKind.ObjectLiteralExpression,
      ),
      documentTypes: getObjectProperty(
        literal,
        "documentTypes",
        SyntaxKind.ArrayLiteralExpression,
      ),
    })),
    map(({ config, documentTypes }) => ({
      sourceFile: config?.getSourceFile(),
      id: getObjectProperty(
        config,
        "id",
        SyntaxKind.StringLiteral,
      )?.getLiteralValue(),
      name: getObjectProperty(
        config,
        "name",
        SyntaxKind.StringLiteral,
      )?.getLiteralValue(),
      documentTypes: pipe(
        documentTypes?.getElements() ?? [],
        map((item) => item.asKind(SyntaxKind.StringLiteral)),
        filter(isTruthy),
        map((item) => item.getLiteralValue()),
      ),
    })),
  );
  const apps = filter(editorConfigs, ({ documentTypes }) =>
    documentTypes.includes("powerhouse/document-drive"),
  );
  const documentEditors = filter(
    editorConfigs,
    ({ documentTypes }) => !documentTypes.includes("powerhouse/document-drive"),
  );

  for (const { name, id, documentTypes, sourceFile } of documentEditors) {
    if (!name || !id || !documentTypes.length || !sourceFile) return;
    await generateEditor(
      {
        editorName: name,
        editorId: id,
        documentTypes,
        editorDirName: sourceFile.getDirectory().getBaseName(),
      },
      projectDir,
    ).catch(console.error);
  }

  for (const { name, id, documentTypes, sourceFile } of apps) {
    if (!name || !id || !documentTypes.length || !sourceFile) return;
    const directory = sourceFile.getDirectory();
    const configFile = directory.getSourceFile("config.ts");
    if (!configFile) return;
    const configObject = getObjectLiteral(
      configFile.getVariableStatement("editorConfig"),
    );
    const allowedDocumentTypes = pipe(
      getObjectProperty(
        configObject,
        "allowedDocumentTypes",
        SyntaxKind.ArrayLiteralExpression,
      )?.getElements() ?? [],
      map((item) => item.asKind(SyntaxKind.StringLiteral)),
      filter(isTruthy),
      map((item) => item.getLiteralValue()),
    );
    await generateApp(
      {
        appName: name,
        appId: id,
        appDirName: directory.getBaseName(),
        allowedDocumentTypes,
      },
      projectDir,
    ).catch(console.error);
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
