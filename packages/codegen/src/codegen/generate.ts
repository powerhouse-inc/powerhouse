import type {
  PartialPowerhouseManifest,
  PowerhouseConfig,
  PowerhouseManifest,
} from "@powerhousedao/config";
import { paramCase } from "change-case";
import type { DocumentModelGlobalState } from "document-model";
import fs from "node:fs";
import path, { join } from "node:path";
import { readPackage, type NormalizedPackageJson } from "read-pkg";
import semver from "semver";
import { TSMorphCodeGenerator } from "../ts-morph-generator/index.js";
import { tsMorphGenerateEditor } from "../ts-morph-utils/file-builders/document-editor.js";
import {
  makeDocumentModelModulesFile,
  tsMorphGenerateDocumentModel,
} from "../ts-morph-utils/file-builders/document-model.js";
import { tsMorphGenerateDriveEditor } from "../ts-morph-utils/file-builders/drive-editor.js";
import { makeSubgraphsIndexFile } from "../ts-morph-utils/file-builders/subgraphs.js";
import { buildTsMorphProject } from "../ts-morph-utils/ts-morph-project.js";
import { generateDocumentModelZodSchemas, generateSchemas } from "./graphql.js";
import {
  hygenGenerateDocumentModel,
  hygenGenerateDriveEditor,
  hygenGenerateEditor,
  hygenGenerateImportScript,
  hygenGenerateProcessor,
  hygenGenerateSubgraph,
} from "./hygen.js";
import type { CodegenOptions } from "./types.js";
import { getDocumentTypesMap, loadDocumentModel } from "./utils.js";

export async function generateAll(args: {
  dir: string;
  useTsMorph: boolean;
  useVersioning: boolean;
  watch?: boolean;
  skipFormat?: boolean;
  verbose?: boolean;
  force?: boolean;
}) {
  const {
    dir,
    useTsMorph,
    useVersioning,
    watch = false,
    skipFormat = false,
    verbose = true,
    force = true,
  } = args;
  const files = fs.readdirSync(dir, { withFileTypes: true });
  const documentModelStates: DocumentModelGlobalState[] = [];

  for (const directory of files.filter((f) => f.isDirectory())) {
    const documentModelPath = path.join(
      dir,
      directory.name,
      `${directory.name}.json`,
    );
    if (!fs.existsSync(documentModelPath)) {
      continue;
    }

    try {
      const documentModelState = await loadDocumentModel(documentModelPath);
      documentModelStates.push(documentModelState);

      await generateDocumentModel({
        dir,
        documentModelState,
        watch,
        skipFormat,
        verbose,
        force,
        useTsMorph,
        useVersioning,
      });
    } catch (error) {
      if (verbose) {
        console.error(directory.name, error);
      }
    }
  }
}

export async function generate(
  config: PowerhouseConfig,
  useTsMorph: boolean,
  useVersioning: boolean,
) {
  const { skipFormat, watch } = config;
  await generateSchemas(config.documentModelsDir, { skipFormat, watch });
  await generateAll({
    dir: config.documentModelsDir,
    useTsMorph,
    useVersioning,
    skipFormat,
    watch,
  });
}

export async function generateFromFile(args: {
  path: string;
  config: PowerhouseConfig;
  useTsMorph: boolean;
  useVersioning: boolean;
  options?: CodegenOptions;
}) {
  const { path, config, useTsMorph, useVersioning, options } = args;
  // load document model spec from file
  const documentModelState = await loadDocumentModel(path);

  // delegate to shared generation function
  await generateFromDocumentModel({
    documentModelState,
    config,
    useTsMorph,
    useVersioning,
    options,
  });
}

/**
 * Generates code from a DocumentModelGlobalState object directly.
 *
 * @remarks
 * This function performs the same code generation as generateFromFile but takes
 * a DocumentModelGlobalState object directly instead of loading from a file. This allows for
 * programmatic code generation without file I/O.
 *
 * @param documentModelDocument - The DocumentModelGlobalState object containing the document model
 * @param config - The PowerhouseConfig configuration object
 * @param options - Optional configuration for generation behavior (verbose logging, etc.)
 * @returns A promise that resolves when code generation is complete
 */
export async function generateFromDocument(args: {
  documentModelState: DocumentModelGlobalState;
  config: PowerhouseConfig;
  useTsMorph: boolean;
  useVersioning: boolean;
  options?: CodegenOptions;
}) {
  // delegate to shared generation function
  await generateFromDocumentModel(args);
}

type GenerateDocumentModelArgs = {
  dir: string;
  documentModelState: DocumentModelGlobalState;
  useTsMorph: boolean;
  useVersioning: boolean;
  specifiedPackageName?: string;
  watch?: boolean;
  skipFormat?: boolean;
  verbose?: boolean;
  force?: boolean;
};
export async function generateDocumentModel(args: GenerateDocumentModelArgs) {
  const {
    dir,
    documentModelState,
    specifiedPackageName,
    useTsMorph,
    useVersioning,
    ...hygenArgs
  } = args;
  const packageJson = await readPackage();
  const packageNameFromPackageJson = packageJson.name;
  const packageName = specifiedPackageName || packageNameFromPackageJson;
  const zodSemverString = findZodDependencyInPackageJson(packageJson);
  ensureZodVersionIsSufficient(zodSemverString);

  const projectDir = path.dirname(dir);
  if (!useTsMorph) {
    await hygenGenerateDocumentModel(
      documentModelState,
      dir,
      packageName,
      hygenArgs,
    );
    const specification =
      documentModelState.specifications[
        documentModelState.specifications.length - 1
      ];

    const documentModelsDirPath = path.join(projectDir, "document-models");
    const documentModelDirPath = path.join(
      documentModelsDirPath,
      paramCase(documentModelState.name),
    );

    await generateDocumentModelZodSchemas({
      documentModelDirPath,
      specification,
    });

    const generator = new TSMorphCodeGenerator(
      projectDir,
      [documentModelState],
      packageName,
      {
        directories: { documentModelDir: "document-models" },
        forceUpdate: true,
      },
    );

    await generator.generateReducers();

    const project = buildTsMorphProject(projectDir);
    makeDocumentModelModulesFile({
      project,
      projectDir,
    });
  } else {
    await tsMorphGenerateDocumentModel({
      projectDir,
      packageName,
      documentModelState,
      useVersioning,
    });
  }
}

function findZodDependencyInPackageJson(
  packageJson: NormalizedPackageJson,
): string | undefined {
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
  const zodDependency = dependencies["zod"];
  return zodDependency;
}

function ensureZodVersionIsSufficient(zodSemverString: string | undefined) {
  if (!zodSemverString) return;
  const isSufficient = semver.satisfies("4.1.13", zodSemverString);
  if (!isSufficient) {
    throw new Error(
      `Your version of zod "${zodSemverString}" is out of date. Please install zod version 4.x to continue.`,
    );
  }
}

type GenerateEditorArgs = {
  name: string;
  documentTypes: string[];
  config: PowerhouseConfig;
  useTsMorph: boolean;
  editorId?: string;
  specifiedPackageName?: string;
  editorDirName?: string;
};
export async function generateEditor(args: GenerateEditorArgs) {
  const {
    name,
    documentTypes,
    config,
    useTsMorph,
    editorId: editorIdArg,
    specifiedPackageName,
    editorDirName,
  } = args;

  if (!useTsMorph) {
    const pathOrigin = "../../";

    const { documentModelsDir, skipFormat } = config;
    const documentTypesMap = getDocumentTypesMap(documentModelsDir, pathOrigin);

    const invalidType = documentTypes.find(
      (type) => !Object.keys(documentTypesMap).includes(type),
    );
    if (invalidType) {
      throw new Error(
        `Document model for ${invalidType} not found. Make sure the document model is available in the document-models directory (${documentModelsDir}) and has been properly generated.`,
      );
    }
    const packageNameFromPackageJson = await readPackage().then(
      (pkg) => pkg.name,
    );
    const packageName = specifiedPackageName || packageNameFromPackageJson;
    return hygenGenerateEditor({
      name,
      documentTypes,
      documentTypesMap,
      dir: config.editorsDir,
      documentModelsDir: config.documentModelsDir,
      packageName,
      skipFormat,
      editorId: args.editorId,
      editorDirName,
    });
  }

  const packageNameFromPackageJson = await readPackage().then(
    (pkg) => pkg.name,
  );
  const packageName = specifiedPackageName || packageNameFromPackageJson;

  const projectDir = path.dirname(config.editorsDir);

  if (documentTypes.length > 1) {
    throw new Error("Multiple document types are not supported yet");
  }

  const documentModelId = documentTypes[0];
  const editorName = name;
  const editorId = editorIdArg || paramCase(editorName);
  const editorDir = editorDirName || paramCase(editorName);

  tsMorphGenerateEditor({
    packageName,
    projectDir,
    editorDir,
    documentModelId,
    editorName,
    editorId,
  });
}

export async function generateDriveEditor(options: {
  name: string;
  config: PowerhouseConfig;
  useTsMorph: boolean;
  appId?: string;
  allowedDocumentTypes?: string;
  isDragAndDropEnabled?: boolean;
  driveEditorDirName?: string;
  specifiedPackageName?: string;
}) {
  const {
    name,
    config,
    appId,
    allowedDocumentTypes,
    isDragAndDropEnabled,
    driveEditorDirName,
    specifiedPackageName,
    useTsMorph,
  } = options;
  const dir = config.editorsDir;

  const packageNameFromPackageJson = await readPackage().then(
    (pkg) => pkg.name,
  );
  const packageName = specifiedPackageName || packageNameFromPackageJson;

  const projectDir = path.dirname(dir);

  if (!useTsMorph) {
    const {
      name,
      config,
      appId,
      allowedDocumentTypes,
      isDragAndDropEnabled,
      driveEditorDirName,
    } = options;
    const dir = config.editorsDir;
    const skipFormat = config.skipFormat;

    return hygenGenerateDriveEditor({
      name,
      dir,
      appId: appId ?? paramCase(name),
      allowedDocumentTypes: allowedDocumentTypes,
      isDragAndDropEnabled: isDragAndDropEnabled ?? true,
      skipFormat,
      driveEditorDirName,
    });
  }

  tsMorphGenerateDriveEditor({
    projectDir,
    editorDir: driveEditorDirName || paramCase(name),
    editorName: name,
    editorId: appId ?? paramCase(name),
    packageName,
    allowedDocumentModelIds: allowedDocumentTypes?.split(",") ?? [],
    isDragAndDropEnabled: isDragAndDropEnabled ?? true,
  });
}

export async function generateSubgraphFromDocumentModel(
  name: string,
  documentModel: DocumentModelGlobalState,
  config: PowerhouseConfig,
  options: CodegenOptions = {},
) {
  await hygenGenerateSubgraph(name, documentModel, { ...config, ...options });
  makeSubgraphsIndexFile({ projectDir: path.dirname(config.subgraphsDir) });
}

export async function generateSubgraph(
  name: string,
  file: string | null,

  config: PowerhouseConfig,
  options: CodegenOptions = {},
) {
  const documentModelState =
    file !== null ? await loadDocumentModel(file) : null;

  await hygenGenerateSubgraph(name, documentModelState, {
    ...config,
    ...options,
  });
  makeSubgraphsIndexFile({ projectDir: path.dirname(config.subgraphsDir) });
}

export async function generateProcessor(
  name: string,
  type: "analytics" | "relationalDb",
  documentTypes: string[],
  config: PowerhouseConfig,
) {
  const { skipFormat } = config;

  return hygenGenerateProcessor(
    name,
    documentTypes,
    config.processorsDir,
    type,
    { skipFormat },
  );
}

export async function generateImportScript(
  name: string,
  config: PowerhouseConfig,
) {
  return hygenGenerateImportScript(name, config.importScriptsDir, {
    skipFormat: config.skipFormat,
  });
}

const defaultManifest: PowerhouseManifest = {
  name: "",
  description: "",
  category: "",
  publisher: {
    name: "",
    url: "",
  },
  documentModels: [],
  editors: [],
  apps: [],
  subgraphs: [],
  importScripts: [],
};

export function generateManifest(
  manifestData: PartialPowerhouseManifest,
  projectRoot?: string,
) {
  const rootDir = projectRoot || process.cwd();
  const manifestPath = join(rootDir, "powerhouse.manifest.json");

  // Create default manifest structure

  // Read existing manifest if it exists
  let existingManifest: PowerhouseManifest = defaultManifest;
  if (fs.existsSync(manifestPath)) {
    try {
      const existingData = fs.readFileSync(manifestPath, "utf-8");
      existingManifest = JSON.parse(existingData) as PowerhouseManifest;
    } catch (error) {
      console.warn(`Failed to parse existing manifest: ${String(error)}`);
      existingManifest = defaultManifest;
    }
  }

  // Helper function to merge arrays by ID
  const mergeArrayById = <T extends { id: string }>(
    existingArray: T[],
    newArray?: T[],
  ): T[] => {
    if (!newArray) return existingArray;

    const result = [...existingArray];

    newArray.forEach((newItem) => {
      const existingIndex = result.findIndex((item) => item.id === newItem.id);
      if (existingIndex !== -1) {
        // Replace existing item
        result[existingIndex] = newItem;
      } else {
        // Add new item
        result.push(newItem);
      }
    });

    return result;
  };

  // Merge partial data with existing manifest
  const updatedManifest: PowerhouseManifest = {
    ...existingManifest,
    ...manifestData,
    publisher: {
      ...existingManifest.publisher,
      ...(manifestData.publisher || {}),
    },
    documentModels: mergeArrayById(
      existingManifest.documentModels,
      manifestData.documentModels,
    ),
    editors: mergeArrayById(existingManifest.editors, manifestData.editors),
    apps: mergeArrayById(existingManifest.apps, manifestData.apps),
    subgraphs: mergeArrayById(
      existingManifest.subgraphs,
      manifestData.subgraphs,
    ),
    importScripts: mergeArrayById(
      existingManifest.importScripts,
      manifestData.importScripts,
    ),
  };

  // Write updated manifest to file
  fs.writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 4));

  return manifestPath;
}

/**
 * Generates code from a DocumentModelGlobalState.
 *
 * @remarks
 * This is the core generation function that both generateFromFile and generateFromDocument
 * use internally. It handles the actual code generation from a DocumentModelGlobalState object.
 *
 * @param documentModel - The DocumentModelGlobalState containing the document model specification
 * @param config - The PowerhouseConfig configuration object
 * @param options - Optional configuration for generation behavior
 * @returns A promise that resolves when code generation is complete
 */
async function generateFromDocumentModel(args: {
  documentModelState: DocumentModelGlobalState;
  config: PowerhouseConfig;
  useTsMorph: boolean;
  useVersioning: boolean;
  options?: CodegenOptions;
}) {
  const {
    documentModelState,
    config,
    useTsMorph,
    useVersioning,
    options = {},
  } = args;
  // Derive verbose from config.logLevel if not explicitly provided
  // Show hygen logs for verbose, debug, and info levels (default behavior before ts-morph)
  const {
    verbose = config.logLevel === "verbose" ||
      config.logLevel === "debug" ||
      config.logLevel === "info",
    force = false,
  } = options;
  const name = paramCase(documentModelState.name);
  const documentModelDir = join(config.documentModelsDir, name);
  // create document model folder and spec as json
  fs.mkdirSync(documentModelDir, { recursive: true });
  fs.writeFileSync(
    join(documentModelDir, `${name}.json`),
    JSON.stringify(documentModelState, null, 2),
  );

  await generateDocumentModel({
    dir: config.documentModelsDir,
    documentModelState,
    watch: config.watch,
    skipFormat: config.skipFormat,
    verbose,
    force,
    useTsMorph,
    useVersioning,
  });

  await generateSubgraphFromDocumentModel(name, documentModelState, config, {
    verbose,
  });
}
