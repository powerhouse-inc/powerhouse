#! /usr/bin/env node
import { DocumentModelState } from "document-model/document-model";
import { typeDefs } from "@powerhousedao/scalars";
import {
  generateAll,
  generateEditor as _generateEditor,
  generateProcessor as _generateProcessor,
  generateDocumentModel,
} from "./hygen";
import { generateSchemas, generateSchema } from "./graphql";
import type { PowerhouseConfig } from "../utils/index";
import fs from "node:fs";
import { join, resolve } from "path";
import { paramCase, pascalCase } from "change-case";
import { loadDocumentModel } from "./utils";

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

function getDocumentTypesMap(dir: string) {
  const documentTypesMap: Record<string, string> = {};
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
          documentTypesMap[spec.id] = pascalCase(name);
        }
      } catch {
        console.error(`Failed to parse ${specPath}`);
      }
    });
  return documentTypesMap;
}

export async function generate(config: PowerhouseConfig) {
  const { skipFormat, watch } = config;
  await generateSchemas(config.documentModelsDir, { skipFormat, watch });
  await generateAll(config.documentModelsDir, { skipFormat, watch });
}

export async function generateFromFile(path: string, config: PowerhouseConfig) {
  // load document model spec from file
  const documentModel = await loadDocumentModel(path);

  const name = paramCase(documentModel.name);

  // create document model folder and spec as json
  fs.mkdirSync(join(config.documentModelsDir, name), { recursive: true });
  fs.writeFileSync(
    join(config.documentModelsDir, name, `${name}.json`),
    JSON.stringify(documentModel, null, 4)
  );

  // bundle graphql schemas together
  const schemaStr = [
    typeDefs.join("\n"), // inject ph scalars
    generateGraphqlSchema(documentModel),
  ].join("\n");

  if (schemaStr) {
    fs.writeFileSync(
      join(config.documentModelsDir, name, `schema.graphql`),
      schemaStr
    );
  }

  await generateSchema(name, config.documentModelsDir, config);
  await generateDocumentModel(documentModel, config.documentModelsDir, config);
}

export async function generateEditor(
  name: string,
  documentTypes: string[],
  config: PowerhouseConfig
) {
  const { documentModelsDir, skipFormat } = config;
  const docummentTypesMap = getDocumentTypesMap(documentModelsDir);

  const invalidType = documentTypes.find(
    (type) => !Object.keys(docummentTypesMap).includes(type)
  );
  if (invalidType) {
    throw new Error(`Document model for ${invalidType} not found`);
  }
  return _generateEditor(
    name,
    documentTypes,
    docummentTypesMap,
    config.editorsDir,
    config.documentModelsDir,
    { skipFormat }
  );
}

export async function generateProcessor(
  name: string,
  type: "analytics" | "operational",
  documentTypes: string[],
  config: PowerhouseConfig
) {
  const { documentModelsDir, skipFormat } = config;
  const docummentTypesMap = getDocumentTypesMap(documentModelsDir);

  const invalidType = documentTypes.find(
    (type) => !Object.keys(docummentTypesMap).includes(type)
  );
  if (invalidType) {
    throw new Error(`Document model for ${invalidType} not found`);
  }
  return _generateProcessor(
    name,
    documentTypes,
    docummentTypesMap,
    config.editorsDir,
    config.documentModelsDir,
    type,
    { skipFormat }
  );
}
