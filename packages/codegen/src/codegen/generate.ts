import type { Manifest } from "@powerhousedao/shared";
import { fileExists, type PowerhouseConfig } from "@powerhousedao/shared/clis";
import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import type { ProcessorApps } from "@powerhousedao/shared/processors";
import { kebabCase } from "change-case";
import {
  makeSubgraphsIndexFile,
  tsMorphGenerateApp,
  tsMorphGenerateDocumentEditor,
  tsMorphGenerateDocumentModel,
  tsMorphGenerateSubgraph,
} from "file-builders";
import { getTsconfig } from "get-tsconfig";
import fs from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import path, { join } from "node:path";
import { readPackage, type NormalizedPackageJson } from "read-pkg";
import semver from "semver";
import {
  exportsTemplate,
  tsconfigPathsTemplate,
  tsConfigTemplate,
} from "templates";
import { writePackage } from "write-package";
import { tsMorphGenerateProcessor } from "../file-builders/processors/processor.js";
import { generateSchemas } from "./graphql.js";
import type { CodegenOptions } from "./types.js";
import { loadDocumentModel } from "./utils.js";

export async function generateAll(args: {
  dir: string;
  useVersioning: boolean;
  migrateLegacy?: boolean;
  watch?: boolean;
  skipFormat?: boolean;
  verbose?: boolean;
  force?: boolean;
}) {
  const {
    dir,
    useVersioning,
    migrateLegacy = false,
    watch = false,
    skipFormat = false,
    verbose = true,
    force = true,
  } = args;
  const files = await readdir(dir, { withFileTypes: true });
  const documentModelStates: DocumentModelGlobalState[] = [];

  for (const directory of files.filter((f) => f.isDirectory())) {
    const documentModelPath = path.join(
      dir,
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

      await generateDocumentModel({
        dir,
        documentModelState,
        watch,
        skipFormat,
        verbose,
        force,
        useVersioning,
        migrateLegacy,
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
  useVersioning: boolean,
  migrateLegacy = false,
) {
  const { skipFormat, watch } = config;
  await generateSchemas(config.documentModelsDir, { skipFormat, watch });
  await generateAll({
    dir: config.documentModelsDir,
    useVersioning,
    migrateLegacy,
    skipFormat,
    watch,
  });
}

export async function generateFromFile(args: {
  path: string;
  config: PowerhouseConfig;
  useVersioning: boolean;
  migrateLegacy?: boolean;
  options?: CodegenOptions;
}) {
  const { path, config, useVersioning, migrateLegacy, options } = args;
  // load document model spec from file
  const documentModelState = await loadDocumentModel(path);

  // delegate to shared generation function
  await generateFromDocumentModel({
    documentModelState,
    config,
    useVersioning,
    migrateLegacy,
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
  useVersioning: boolean;
  migrateLegacy?: boolean;
  options?: CodegenOptions;
}) {
  // delegate to shared generation function
  await generateFromDocumentModel(args);
}

type GenerateDocumentModelArgs = {
  dir: string;
  documentModelState: DocumentModelGlobalState;
  useVersioning: boolean;
  migrateLegacy?: boolean;
  watch?: boolean;
  skipFormat?: boolean;
  verbose?: boolean;
  force?: boolean;
};
export async function generateDocumentModel(args: GenerateDocumentModelArgs) {
  const { dir, documentModelState, useVersioning, migrateLegacy } = args;
  const packageJson = await readPackage();
  const zodSemverString = findZodDependencyInPackageJson(packageJson);
  ensureZodVersionIsSufficient(zodSemverString);

  const projectDir = path.dirname(dir);
  await tsMorphGenerateDocumentModel({
    projectDir,
    documentModelState,
    useVersioning,
    migrateLegacy,
  });
  // await ensurePackageExportsWildcards();
  // await ensureTsconfigPaths();
}

/**
 * Ensures that the project's package.json exports field contains the
 * wildcard subpath patterns required for deep imports like
 * "document-models/my-doc" to resolve correctly.
 */
async function ensurePackageExportsWildcards() {
  const requiredExports = JSON.parse(`{ ${exportsTemplate} }`) as Record<
    string,
    string
  >;

  const packageJson = await readPackage();

  const existingExports =
    !packageJson.exports ||
    typeof packageJson.exports === "string" ||
    Array.isArray(packageJson.exports)
      ? {}
      : packageJson.exports;

  packageJson.exports = {
    ...existingExports,
    ...requiredExports,
  };

  await writePackage(process.cwd(), packageJson);
}

/**
 * Ensures that the project's tsconfig.json has paths mappings for
 * the convenience export paths like "document-models/" etc.
 */
async function ensureTsconfigPaths() {
  const requiredTsConfigPaths = JSON.parse(
    `{ ${tsconfigPathsTemplate} }`,
  ) as Record<string, string[]>;
  const tsConfigFilePath = join(process.cwd(), "tsconfig.json");
  let tsConfig = getTsconfig();

  if (!tsConfig) {
    await writeFile(tsConfigFilePath, tsConfigTemplate);
    tsConfig = getTsconfig();
  }

  if (!tsConfig) {
    throw new Error(
      `Failed to get or create tsconfig.json at "${tsConfigFilePath}".`,
    );
  }

  const existingCompilerOptions = tsConfig.config.compilerOptions ?? {};
  const existingPaths = existingCompilerOptions.paths ?? {};

  tsConfig.config.compilerOptions = {
    ...existingCompilerOptions,
    paths: {
      ...existingPaths,
      ...requiredTsConfigPaths,
    },
  };

  await writeFile(tsConfigFilePath, JSON.stringify(tsConfig.config, null, 2));
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
  const cleaned = semver.clean(zodSemverString);
  if (!cleaned) return;
  const isSufficient = semver.gte(cleaned, "4.0.0");
  if (!isSufficient) {
    throw new Error(
      `Your version of zod "${zodSemverString}" is out of date. Please install zod version 4.x to continue.`,
    );
  }
}

type GenerateEditorArgs = {
  editorName: string;
  documentTypes: string[];
  skipFormat?: boolean;
  editorId?: string;
  editorDirName?: string;
};
export async function generateEditor(args: GenerateEditorArgs) {
  const {
    editorName,
    documentTypes,
    editorId: editorIdArg,
    editorDirName,
  } = args;

  const projectDir = path.dirname("editors");

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
  // await ensurePackageExportsWildcards();
  // await ensureTsconfigPaths();
}

export async function generateApp(options: {
  appName: string;
  skipFormat?: boolean;
  appId?: string;
  allowedDocumentTypes?: string[];
  isDragAndDropEnabled?: boolean;
  appDirName?: string;
}) {
  const {
    appName,
    appId,
    allowedDocumentTypes,
    isDragAndDropEnabled,
    appDirName,
  } = options;
  const dir = "editors";

  const projectDir = path.dirname(dir);

  await tsMorphGenerateApp({
    projectDir,
    editorDir: appDirName || kebabCase(appName),
    editorName: appName,
    editorId: appId ?? kebabCase(appName),
    allowedDocumentModelIds: allowedDocumentTypes ?? [],
    isDragAndDropEnabled: isDragAndDropEnabled ?? true,
  });
}

export async function generateSubgraphFromDocumentModel(
  name: string,
  documentModel: DocumentModelGlobalState,
  config: PowerhouseConfig,
) {
  await tsMorphGenerateSubgraph({
    subgraphsDir: config.subgraphsDir,
    subgraphName: name,
    documentModel,
  });
  await makeSubgraphsIndexFile({
    projectDir: path.dirname(config.subgraphsDir),
  });
}

export async function generateSubgraph(
  name: string,
  file: string | null,
  config: PowerhouseConfig,
) {
  const documentModelState =
    file !== null ? await loadDocumentModel(file) : null;

  await tsMorphGenerateSubgraph({
    subgraphsDir: config.subgraphsDir,
    subgraphName: name,
    documentModel: documentModelState,
  });
  await makeSubgraphsIndexFile({
    projectDir: path.dirname(config.subgraphsDir),
  });
}

export async function generateProcessor(args: {
  processorName: string;
  processorType: "analytics" | "relationalDb";
  processorApps: ProcessorApps;
  documentTypes: string[];
  skipFormat?: boolean;
  rootDir?: string;
}) {
  const { rootDir = process.cwd() } = args;
  return await tsMorphGenerateProcessor({
    rootDir,
    ...args,
  });
}

export async function generateImportScript(
  _name: string,
  _config: PowerhouseConfig,
) {
  throw new Error(
    "Import script generation has been removed. The document-drive server APIs it depended on have been deprecated.",
  );
}

const defaultManifest: Manifest = {
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
  processors: [],
};

export function generateManifest(
  manifestData: Partial<Manifest>,
  projectRoot?: string,
) {
  const rootDir = projectRoot || process.cwd();
  const manifestPath = join(rootDir, "powerhouse.manifest.json");

  // Create default manifest structure

  // Read existing manifest if it exists
  let existingManifest: Manifest = defaultManifest;
  if (fs.existsSync(manifestPath)) {
    try {
      const existingData = fs.readFileSync(manifestPath, "utf-8");
      existingManifest = JSON.parse(existingData) as Manifest;
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

  // Helper function to merge config entries by name (config entries are keyed
  // by name, not id).
  const mergeConfigByName = <T extends { name: string }>(
    existingArray: T[],
    newArray?: T[],
  ): T[] => {
    if (!newArray) return existingArray;

    const result = [...existingArray];

    newArray.forEach((newItem) => {
      const existingIndex = result.findIndex(
        (item) => item.name === newItem.name,
      );
      if (existingIndex !== -1) {
        result[existingIndex] = newItem;
      } else {
        result.push(newItem);
      }
    });

    return result;
  };

  // Merge partial data with existing manifest
  const updatedManifest: Manifest = {
    ...existingManifest,
    ...manifestData,
    publisher: {
      ...existingManifest.publisher,
      ...(manifestData.publisher || {}),
    },
    documentModels: mergeArrayById(
      existingManifest.documentModels ?? [],
      manifestData.documentModels,
    ),
    editors: mergeArrayById(
      existingManifest.editors ?? [],
      manifestData.editors,
    ),
    apps: mergeArrayById(existingManifest.apps ?? [], manifestData.apps),
    subgraphs: mergeArrayById(
      existingManifest.subgraphs ?? [],
      manifestData.subgraphs,
    ),
    config: mergeConfigByName(
      existingManifest.config ?? [],
      manifestData.config,
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
  useVersioning: boolean;
  migrateLegacy?: boolean;
  options?: CodegenOptions;
}) {
  const {
    documentModelState,
    config,
    useVersioning,
    migrateLegacy,
    options = {},
  } = args;
  const {
    verbose = config.logLevel === "verbose" ||
      config.logLevel === "debug" ||
      config.logLevel === "info",
    force = false,
  } = options;
  const name = kebabCase(documentModelState.name);
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
    useVersioning,
    migrateLegacy,
  });
}
