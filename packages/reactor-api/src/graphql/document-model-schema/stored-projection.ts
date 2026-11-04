import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import { camelCase, pascalCase } from "change-case";
import { childLogger } from "document-model";
import { parse } from "graphql";
import {
  getDocumentModelSchemaName,
  hasValidSchema,
} from "../model-schema-templates.js";
import {
  buildModelProjection,
  type DocumentModelSchemaSource,
  type ModelDocuments,
} from "./model-projection.js";
import {
  ALL_PREFIX_KINDS,
  definedTypeNames,
  generatedModelDefinitions,
  parseSdl,
} from "./schema-ast.js";

// Named as before the stored reader left create-schema, so its log lines stay.
const logger = childLogger(["reactor-api", "create-schema"]);

type Specification = DocumentModelGlobalState["specifications"][number];

/**
 * Reads a model's schema out of its latest stored specification's SDL, on
 * every call. Malformed SDL fails, or falls back, where it always has.
 */
export function storedSchemaSource(
  global: DocumentModelGlobalState,
): DocumentModelSchemaSource {
  return {
    packageScalars: [],
    hasOperationSchemas: () => {
      const specification = global.specifications.at(-1);
      if (!specification) return false;
      return specification.modules.some((module) =>
        module.operations.some((op) => hasValidSchema(op.schema)),
      );
    },
    modelDefinitions: () => {
      const dmSchemaName = getDocumentModelSchemaName(global);
      // Use only the latest specification to avoid duplicate type definitions
      // when a document model has multiple versions (e.g. v1, v2).
      const latestSpec = global.specifications.at(-1);
      const globalSchema = latestSpec?.state.global.schema ?? "";
      const localSchema = latestSpec?.state.local.schema ?? "";
      return generatedModelDefinitions(
        dmSchemaName,
        parseSdl(globalSchema),
        parseSdl(localSchema),
      );
    },
    modelProjection: () => {
      const documentName = getDocumentModelSchemaName(global);
      return buildModelProjection(
        documentName,
        storedDocuments(global.specifications.at(-1), documentName),
      );
    },
    stateDefinitions: () => {
      const specification = global.specifications.at(-1);
      if (!specification) return [];

      const globalSchema = specification.state.global.schema ?? "";
      const localSchema = specification.state.local.schema ?? "";
      const fullSchema = `${globalSchema}\n${localSchema}`;

      if (!fullSchema.trim()) return [];

      try {
        return parse(fullSchema).definitions;
      } catch {
        return [];
      }
    },
    mutationOperations: () =>
      global.specifications
        .at(-1)
        ?.modules.flatMap((module) => module.operations.filter((op) => op.name))
        .map((op) => ({
          camelName: camelCase(op.name!),
          storedName: op.name!,
          creatorKey: camelCase(op.name!),
        })) ?? [],
  };
}

/**
 * Type names a schema defines. Unparseable schemas yield no names.
 */
function extractTypeNames(schema: string): string[] {
  try {
    return definedTypeNames(parseSdl(schema), ALL_PREFIX_KINDS);
  } catch (error) {
    logger.debug(`Skipping unparseable schema: ${String(error)}`);
    return [];
  }
}

/**
 * The template documents of a stored specification. Type names skip
 * unparseable schemas; the global state and served operation schemas must
 * parse; a scope schema that does not parse strictly is served as `JSONObject`.
 */
function storedDocuments(
  specification: Specification | undefined,
  documentName: string,
): ModelDocuments {
  const globalStateSchema = specification?.state.global.schema;
  const localStateSchema = specification?.state.local.schema;
  const stateTypeNames = [
    ...extractTypeNames(globalStateSchema ?? ""),
    ...extractTypeNames(localStateSchema ?? ""),
  ];
  const operationTypeNames =
    specification?.modules.flatMap((module) =>
      module.operations.flatMap((op) => extractTypeNames(op.schema ?? "")),
    ) ?? [];
  const global = parseSdl(globalStateSchema ?? "");
  const operations =
    specification?.modules.flatMap((module) =>
      module.operations
        .filter((op) => op.name && hasValidSchema(op.schema))
        .map((op) => ({
          camelName: camelCase(op.name!),
          inputTypeName: `${documentName}_${pascalCase(op.name!)}Input`,
        })),
    ) ?? [];
  const modules =
    specification?.modules.map((module) => ({
      name: module.name,
      operations: module.operations
        .filter((op) => hasValidSchema(op.schema))
        .map((op) => parseSdl(op.schema ?? "")),
    })) ?? [];
  const hasLocalRoot = (localStateSchema ?? "").includes(
    `type ${documentName}LocalState`,
  );
  return {
    global,
    stateTypeNames,
    operationTypeNames,
    modules,
    operations,
    hasLocalRoot,
    scopes: storedScopes(specification),
  };
}

function storedScopes(
  specification: Specification | undefined,
): ModelDocuments["scopes"] {
  if (!specification) return [];
  return Object.entries(specification.state).map(([name, scopeState]) => {
    const schema = (scopeState as { schema?: string }).schema ?? "";
    if (!hasValidSchema(schema)) return { name, document: null };
    try {
      return { name, document: parse(schema) };
    } catch {
      return { name, document: null };
    }
  });
}
