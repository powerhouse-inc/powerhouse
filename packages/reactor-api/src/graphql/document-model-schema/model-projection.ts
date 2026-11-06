import type { DocumentModelGraphQLProjection } from "document-model";
import type { DefinitionNode, DocumentNode } from "graphql";
import type { ModelProjection } from "../model-schema-templates.js";
import {
  applyGraphQLTypePrefixes,
  globalStateTypeName,
  printInputTypeDefinitions,
  printModuleOperations,
  scopeInitialState,
} from "./schema-ast.js";

export type ModelMutationOperation = {
  readonly camelName: string;
  readonly inputTypeName: string;
  /** The operation name error messages use. */
  readonly storedName: string;
  /** The key of the operation's action creator. */
  readonly creatorKey: string;
};

export type MutationResolverOperation = Pick<
  ModelMutationOperation,
  "camelName" | "storedName" | "creatorKey"
>;

/**
 * What a document model's schema is built from. Read once per model, from its
 * structured definition or from its stored SDL.
 */
export interface DocumentModelSchemaSource {
  readonly packageScalars: DocumentModelGraphQLProjection["packageScalars"];
  /** Whether any operation has an input to serve. */
  hasOperationSchemas(): boolean;
  /** The definitions the model adds to the generated schema. */
  modelDefinitions(): readonly DefinitionNode[];
  /** The template inputs of the model's own subgraph. */
  modelProjection(): ModelProjection;
  /** The unprefixed state definitions abstract types are resolved over. */
  stateDefinitions(): readonly DefinitionNode[];
  /** The operations the model's subgraph serves as mutations. */
  mutationOperations(): readonly MutationResolverOperation[];
}

/** The documents a {@link ModelProjection} is built from. */
export type ModelDocuments = {
  readonly global: DocumentNode;
  /** Names of the types the state scopes define. */
  readonly stateTypeNames: readonly string[];
  /** Names of the types every operation defines, served or not. */
  readonly operationTypeNames: readonly string[];
  /** Each module's served operation inputs, in declaration order. */
  readonly modules: readonly {
    readonly name: string;
    readonly operations: readonly DocumentNode[];
  }[];
  readonly operations: ModelProjection["operations"];
  readonly hasLocalRoot: boolean;
  /** Each scope's state schema, or `null` when it is served as `JSONObject`. */
  readonly scopes: readonly {
    readonly name: string;
    readonly document: DocumentNode | null;
  }[];
};

export function buildModelProjection(
  documentName: string,
  documents: ModelDocuments,
): ModelProjection {
  const allTypeNames = [
    ...new Set([...documents.stateTypeNames, ...documents.operationTypeNames]),
  ];
  const names = new Set(allTypeNames);
  const modules = documents.modules.flatMap(({ name, operations }) => {
    const sdl = printModuleOperations(operations, documentName, names);
    return sdl === null ? [] : [{ name, sdl }];
  });
  const scopes = documents.scopes.map(({ name, document }) =>
    document === null
      ? { name, type: "JSONObject" }
      : {
          name,
          ...scopeInitialState(document, documentName, name, allTypeNames),
        },
  );
  return {
    documentName,
    operations: documents.operations,
    modules,
    // Operation inputs are already defined in the modules, so the state's own
    // input types leave them out.
    stateInputTypes: applyGraphQLTypePrefixes(
      printInputTypeDefinitions(
        documents.global,
        new Set(documents.operationTypeNames),
      ),
      documentName,
      allTypeNames,
    ),
    globalStateTypeName: globalStateTypeName(documentName),
    localStateTypeName: documents.hasLocalRoot
      ? `${documentName}_${documentName}LocalState`
      : null,
    initialState: {
      inputTypes: scopes
        .flatMap(({ inputTypes }) => inputTypes ?? [])
        .join("\n\n"),
      scopes: scopes.map(({ name, type }) => ({ name, type })),
    },
  };
}
