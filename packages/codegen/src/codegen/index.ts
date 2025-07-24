import { type PowerhouseConfig } from "@powerhousedao/config/powerhouse";
import { typeDefs } from "@powerhousedao/document-engineering/graphql";
import { paramCase, pascalCase } from "change-case";
import {
  type DocumentModelModule,
  type DocumentModelState,
} from "document-model";
import fs from "node:fs";
import { join, resolve } from "path";
import { generateSchema, generateSchemas } from "./graphql.js";
import {
  generateDriveEditor as _generateDriveEditor,
  generateEditor as _generateEditor,
  generateImportScript as _generateImportScript,
  generateProcessor as _generateProcessor,
  generateSubgraph as _generateSubgraph,
  generateAll,
  generateDocumentModel,
} from "./hygen.js";
import { loadDocumentModel } from "./utils.js";

export { generateDBSchema } from "./kysely.js";

export type CodegenOptions = {
  verbose?: boolean;
};

function generateGraphqlSchema(documentModel: DocumentModelState) {
  const spec =
    documentModel.specifications[documentModel.specifications.length - 1];

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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

// returns map of document model id to document model name in pascal case and import path
async function getDocumentTypesMap(
  dir: string,
  pathOrigin = "../../",
): Promise<DocumentTypesMap> {
  const documentTypesMap: DocumentTypesMap = {};

  // add document types from provided dir
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)
      .forEach((name) => {
        const specPath = resolve(dir, name, `${name}.json`);
        if (!fs.existsSync(specPath)) {
          return;
        }

        const specRaw = fs.readFileSync(specPath, "utf-8");
        try {
          const spec = JSON.parse(specRaw) as DocumentModelState;
          if (spec.id) {
            documentTypesMap[spec.id] = {
              name: pascalCase(name),
              importPath: join(pathOrigin, dir, name),
            };
          }
        } catch {
          console.error(`Failed to parse ${specPath}`);
        }
      });
  }

  // add documents from document-model-libs if lib is installed
  try {
    /* eslint-disable */
    // @ts-ignore-error TS2307 this import is expected to fail if document-model-libs is not available
    const documentModels = await import("document-model-libs/document-models");
    Object.keys(documentModels).forEach((name) => {
      const documentModel = documentModels[
        name as keyof typeof documentModels
      ] as DocumentModelModule;
      documentTypesMap[documentModel.documentModel.id] = {
        name,
        importPath: `document-model-libs/${paramCase(name)}`,
      };
    });
    /* eslint-enable */
  } catch {
    /* document-model-libs is not available */
  }

  return documentTypesMap;
}

export async function generate(config: PowerhouseConfig) {
  const { skipFormat, watch } = config;
  await generateSchemas(config.documentModelsDir, { skipFormat, watch });
  await generateAll(config.documentModelsDir, { skipFormat, watch });
}

/**
 * Generates code from a DocumentModelState.
 *
 * @remarks
 * This is the core generation function that both generateFromFile and generateFromDocument
 * use internally. It handles the actual code generation from a DocumentModelState object.
 *
 * @param documentModel - The DocumentModelState containing the document model specification
 * @param config - The PowerhouseConfig configuration object
 * @param filePath - Optional file path for generateSubgraph (null if not from file)
 * @param options - Optional configuration for generation behavior
 * @returns A promise that resolves when code generation is complete
 */
async function generateFromDocumentModel(
  documentModel: DocumentModelState,
  config: PowerhouseConfig,
  filePath?: string | null,
  options: CodegenOptions = {},
) {
  const { verbose = false } = options;
  const name = paramCase(documentModel.name);

  // create document model folder and spec as json
  fs.mkdirSync(join(config.documentModelsDir, name), { recursive: true });
  fs.writeFileSync(
    join(config.documentModelsDir, name, `${name}.json`),
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

  await generateSchema(name, config.documentModelsDir, {
    skipFormat: config.skipFormat,
    verbose,
  });
  await generateDocumentModel(documentModel, config.documentModelsDir, {
    skipFormat: config.skipFormat,
    verbose,
  });
  await generateSubgraph(name, filePath || null, config, { verbose });
}

export async function generateFromFile(
  path: string,
  config: PowerhouseConfig,
  options: CodegenOptions = {},
) {
  // load document model spec from file
  const documentModel = await loadDocumentModel(path);

  // delegate to shared generation function
  await generateFromDocumentModel(documentModel, config, path, options);
}

/**
 * Generates code from a DocumentModelDocument object directly.
 *
 * @remarks
 * This function performs the same code generation as generateFromFile but takes
 * a DocumentModelDocument object directly instead of loading from a file. This allows for
 * programmatic code generation without file I/O.
 *
 * @param documentModelDocument - The DocumentModelDocument object containing the document model
 * @param config - The PowerhouseConfig configuration object
 * @param options - Optional configuration for generation behavior (verbose logging, etc.)
 * @returns A promise that resolves when code generation is complete
 */
export async function generateFromDocument(
  documentModelState: DocumentModelState,
  config: PowerhouseConfig,
  options: CodegenOptions = {},
) {
  // delegate to shared generation function
  await generateFromDocumentModel(documentModelState, config, null, options);
}

export async function generateEditor(
  name: string,
  documentTypes: string[],
  config: PowerhouseConfig,
) {
  const pathOrigin = "../../";

  const { documentModelsDir, skipFormat } = config;
  const documentTypesMap = await getDocumentTypesMap(
    documentModelsDir,
    pathOrigin,
  );

  const invalidType = documentTypes.find(
    (type) => !Object.keys(documentTypesMap).includes(type),
  );
  if (invalidType) {
    throw new Error(`Document model for ${invalidType} not found`);
  }
  return _generateEditor(
    name,
    documentTypes,
    documentTypesMap,
    config.editorsDir,
    config.documentModelsDir,
    { skipFormat },
  );
}

export async function generateSubgraph(
  name: string,
  file: string | null,
  config: PowerhouseConfig,
  options: { verbose?: boolean } = {},
) {
  return _generateSubgraph(
    name,
    file !== null ? await loadDocumentModel(file) : null,
    config.subgraphsDir,
    { skipFormat: config.skipFormat, verbose: options.verbose },
  );
}

export async function generateProcessor(
  name: string,
  type: "analytics" | "relationalDb",
  documentTypes: string[],
  config: PowerhouseConfig,
) {
  const { documentModelsDir, skipFormat } = config;
  const documentTypesMap = await getDocumentTypesMap(documentModelsDir);

  const invalidType = documentTypes.find(
    (type) => !Object.keys(documentTypesMap).includes(type),
  );
  if (invalidType) {
    throw new Error(`Document model for ${invalidType} not found`);
  }

  return _generateProcessor(
    name,
    documentTypes,
    documentTypesMap,
    config.processorsDir,
    config.documentModelsDir,
    type,
    { skipFormat },
  );
}

export type DocumentTypesMap = Record<
  string,
  { name: string; importPath: string }
>;

export async function generateDriveEditor(
  name: string,
  config: PowerhouseConfig,
) {
  return _generateDriveEditor(name, config.editorsDir, {
    skipFormat: config.skipFormat,
  });
}

export async function generateImportScript(
  name: string,
  config: PowerhouseConfig,
) {
  return _generateImportScript(name, config.importScriptsDir, {
    skipFormat: config.skipFormat,
  });
}
