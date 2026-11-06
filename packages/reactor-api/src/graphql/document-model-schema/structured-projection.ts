import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import { camelCase } from "change-case";
import type { DocumentModelGraphQLProjection } from "document-model";
import { type DocumentNode, Kind } from "graphql";
import { getDocumentModelSchemaName } from "../model-schema-templates.js";
import {
  buildModelProjection,
  type DocumentModelSchemaSource,
  type ModelMutationOperation,
} from "./model-projection.js";
import {
  ALL_PREFIX_KINDS,
  definedTypeNames,
  EMPTY_DOCUMENT,
  generatedModelDefinitions,
} from "./schema-ast.js";

type ProjectedOperation =
  DocumentModelGraphQLProjection["modules"][number]["operations"][number];

const documentOf = (
  segment: { readonly document: unknown } | null,
): DocumentNode =>
  segment === null ? EMPTY_DOCUMENT : (segment.document as DocumentNode);

const inputOf = (operation: ProjectedOperation): DocumentNode | null =>
  operation.input as DocumentNode | null;

function once<T>(compute: () => T): () => T {
  let cached: { readonly value: T } | undefined;
  return () => (cached ??= { value: compute() }).value;
}

/**
 * Adapts a definition's GraphQL projection. Each value is derived on first use
 * and kept, since the projection is an immutable snapshot.
 */
export function structuredSchemaSource(
  projection: DocumentModelGraphQLProjection,
  global: DocumentModelGlobalState,
): DocumentModelSchemaSource {
  const name = getDocumentModelSchemaName(global);
  const documentName = () => name;
  const globalDocument = documentOf(projection.global);
  const localDocument = documentOf(projection.local);

  const mutationOperations = once((): ModelMutationOperation[] =>
    projection.modules.flatMap((module) =>
      module.operations.flatMap((operation) => {
        const input = inputOf(operation)?.definitions[0];
        if (input?.kind !== Kind.INPUT_OBJECT_TYPE_DEFINITION) return [];
        return [
          {
            camelName: camelCase(operation.name),
            inputTypeName: `${documentName()}_${input.name.value}`,
            storedName: operation.name,
            permissionKey: operation.actionType,
            creatorKey: operation.creatorKey,
          },
        ];
      }),
    ),
  );

  return {
    packageScalars: projection.packageScalars,
    mutationOperations,
    hasOperationSchemas: once(() =>
      projection.modules.some((module) =>
        module.operations.some((op) => op.input !== null),
      ),
    ),
    modelDefinitions: once(() =>
      generatedModelDefinitions(documentName(), globalDocument, localDocument),
    ),
    stateDefinitions: once(() => [
      ...globalDocument.definitions,
      ...localDocument.definitions,
    ]),
    modelProjection: once(() => {
      const name = documentName();
      const operationInputs = projection.modules.map((module) =>
        module.operations.flatMap((operation) => inputOf(operation) ?? []),
      );
      const localRoot = `${name}LocalState`;
      return buildModelProjection(name, {
        global: globalDocument,
        stateTypeNames: [
          ...definedTypeNames(globalDocument, ALL_PREFIX_KINDS),
          ...definedTypeNames(localDocument, ALL_PREFIX_KINDS),
        ],
        operationTypeNames: operationInputs
          .flat()
          .flatMap((input) => definedTypeNames(input, ALL_PREFIX_KINDS)),
        modules: projection.modules.map((module, index) => ({
          name: module.name,
          operations: operationInputs[index] ?? [],
        })),
        operations: mutationOperations(),
        hasLocalRoot: localDocument.definitions.some(
          (def) =>
            def.kind === Kind.OBJECT_TYPE_DEFINITION &&
            def.name.value === localRoot,
        ),
        scopes: [
          { name: "global", document: globalDocument },
          {
            name: "local",
            document: projection.local === null ? null : localDocument,
          },
        ],
      });
    }),
  };
}
