import type {
  PartialPowerhouseManifest,
  PowerhouseConfig,
  PowerhouseManifest,
} from "@powerhousedao/config";
import { typeDefs } from "@powerhousedao/document-engineering/graphql";
import { paramCase } from "change-case";
import type { DocumentModelGlobalState } from "document-model";
import fs from "node:fs";
import path, { join } from "node:path";
import { readPackage } from "read-pkg";
import { TSMorphCodeGenerator } from "../ts-morph-generator/index.js";
import { tsMorphGenerateEditor } from "../ts-morph-utils/file-builders/document-editor.js";
import {
  makeDocumentModelModulesFile,
  tsMorphGenerateDocumentModel,
} from "../ts-morph-utils/file-builders/document-model.js";
import { tsMorphGenerateDriveEditor } from "../ts-morph-utils/file-builders/drive-editor.js";
import { buildTsMorphProject } from "../ts-morph-utils/ts-morph-project.js";
import { generateSchemas } from "./graphql.js";
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

export async function generateAll(
  dir: string,
  legacy: boolean,
  args: {
    watch?: boolean;
    skipFormat?: boolean;
    verbose?: boolean;
    force?: boolean;
  } = {},
) {
  const {
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
      const documentModel = await loadDocumentModel(documentModelPath);
      documentModelStates.push(documentModel);

      await generateDocumentModel({
        dir,
        documentModelState: documentModel,
        watch,
        skipFormat,
        verbose,
        force,
        legacy,
      });
    } catch (error) {
      if (verbose) {
        console.error(directory.name, error);
      }
    }
  }
}

export async function generate(config: PowerhouseConfig, legacy: boolean) {
  const { skipFormat, watch } = config;
  await generateSchemas(config.documentModelsDir, { skipFormat, watch });
  await generateAll(config.documentModelsDir, legacy, { skipFormat, watch });
}

export async function generateFromFile(
  path: string,
  config: PowerhouseConfig,
  legacy: boolean,
  options: CodegenOptions = {},
) {
  // load document model spec from file
  const documentModel = await loadDocumentModel(path);

  // delegate to shared generation function
  await generateFromDocumentModel(documentModel, config, legacy, path, options);
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
export async function generateFromDocument(
  documentModelState: DocumentModelGlobalState,
  config: PowerhouseConfig,
  legacy: boolean,
  options: CodegenOptions = {},
) {
  // delegate to shared generation function
  await generateFromDocumentModel(
    documentModelState,
    config,
    legacy,
    null,
    options,
  );
}

type GenerateDocumentModelArgs = {
  dir: string;
  documentModelState: DocumentModelGlobalState;
  legacy: boolean;
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
    legacy,
    ...hygenArgs
  } = args;
  const packageNameFromPackageJson = await readPackage().then(
    (pkg) => pkg.name,
  );
  const packageName = specifiedPackageName || packageNameFromPackageJson;
  const projectDir = path.dirname(dir);
  if (legacy) {
    await hygenGenerateDocumentModel(
      documentModelState,
      dir,
      packageName,
      hygenArgs,
    );
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
    });
  }
}

type GenerateEditorArgs = {
  name: string;
  documentTypes: string[];
  config: PowerhouseConfig;
  legacy: boolean;
  editorId?: string;
  specifiedPackageName?: string;
  editorDirName?: string;
};
export async function generateEditor(args: GenerateEditorArgs) {
  const {
    name,
    documentTypes,
    config,
    legacy,
    editorId: editorIdArg,
    specifiedPackageName,
    editorDirName,
  } = args;

  if (legacy) {
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
  legacy: boolean;
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
    legacy,
  } = options;
  const dir = config.editorsDir;

  const packageNameFromPackageJson = await readPackage().then(
    (pkg) => pkg.name,
  );
  const packageName = specifiedPackageName || packageNameFromPackageJson;

  const projectDir = path.dirname(dir);

  if (legacy) {
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
  return hygenGenerateSubgraph(name, documentModel, { ...config, ...options });
}

export async function generateSubgraph(
  name: string,
  file: string | null,
  config: PowerhouseConfig,
  options: CodegenOptions = {},
) {
  return hygenGenerateSubgraph(
    name,
    file !== null ? await loadDocumentModel(file) : null,
    { ...config, ...options },
  );
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

export function generateManifest(
  manifestData: PartialPowerhouseManifest,
  projectRoot?: string,
) {
  const rootDir = projectRoot || process.cwd();
  const manifestPath = join(rootDir, "powerhouse.manifest.json");

  // Create default manifest structure
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

function generateGraphqlSchema(documentModel: DocumentModelGlobalState) {
  const spec =
    documentModel.specifications[documentModel.specifications.length - 1];

  if (!spec) {
    throw new Error(`No spec found for ${documentModel.id}`);
  }

  const {
    modules,
    state: { global, local },
  } = spec;
  const schemas = [
    global.schema,
    local.schema,
    ...modules
      .map((module) => [
        `# ${module.name}`,
        ...module.operations.map((op) => op.schema),
      ])
      .flat()
      .filter((schema) => schema && schema.length > 0),
  ];
  return schemas.join("\n\n");
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
 * @param filePath - Optional file path for generateSubgraph (null if not from file)
 * @param options - Optional configuration for generation behavior
 * @returns A promise that resolves when code generation is complete
 */
async function generateFromDocumentModel(
  documentModel: DocumentModelGlobalState,
  config: PowerhouseConfig,
  legacy: boolean,
  filePath?: string | null,
  options: CodegenOptions = {},
) {
  // Derive verbose from config.logLevel if not explicitly provided
  // Show hygen logs for verbose, debug, and info levels (default behavior before ts-morph)
  const {
    verbose = config.logLevel === "verbose" ||
      config.logLevel === "debug" ||
      config.logLevel === "info",
    force = false,
  } = options;
  const name = paramCase(documentModel.name);
  const documentModelDir = join(config.documentModelsDir, name);
  // create document model folder and spec as json
  fs.mkdirSync(documentModelDir, { recursive: true });
  fs.writeFileSync(
    join(documentModelDir, `${name}.json`),
    JSON.stringify(documentModel, null, 4),
  );

  // bundle graphql schemas together
  const schemaStr = [
    typeDefs.join("\n"), // inject ph scalars
    generateGraphqlSchema(documentModel),
  ].join("\n");

  if (schemaStr) {
    fs.writeFileSync(
      join(config.documentModelsDir, name, `schema.graphql`),
      schemaStr,
    );
  }

  await generateSchemas(documentModelDir, {
    skipFormat: config.skipFormat,
  });

  await generateDocumentModel({
    dir: config.documentModelsDir,
    documentModelState: documentModel,
    watch: config.watch,
    skipFormat: config.skipFormat,
    verbose,
    force,
    legacy,
  });

  await generateSubgraph(name, filePath || null, config, { verbose });
}
