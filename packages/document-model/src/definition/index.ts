/**
 * @experimental Hosts project the GraphQL a specification serves without
 * re-parsing its stored SDL.
 */
export { projectDocumentModelGraphQL } from "./compiler/graphql-projection.js";
/** @experimental The GraphQL documents a host serves for a specification. */
export type { DocumentModelGraphQLProjection } from "./compiler/graphql-projection.js";
export { ph } from "./dsl/field.js";
export { DefinitionError } from "./kernel/diagnostics.js";
export type { Ph } from "./dsl/field.js";
export type {
  EnumDescriptor,
  InputDescriptor,
  InputObjectOf,
  InterfaceDescriptor,
  ListDescriptor,
  ObjectDescriptor,
  OutputObjectOf,
  ReferenceDescriptor,
  ScalarDescriptor,
  UnionDescriptor,
} from "./dsl/types.js";
export { defineDocumentModel } from "./model/define-document-model.js";
export { defineDocumentModelFamily } from "./model/family.js";
export type {
  ActionsForOperationTokens,
  DocumentModelConfig,
  DocumentModelContext,
  DocumentModelFamilyDefinition,
  DocumentModelVersionDefinition,
  ModelModuleToken,
  ModelOperationToken,
  ModelState,
} from "./model/types.js";
/**
 * @experimental Hosts and readers choose the native or the stored path from
 * the inspection kind.
 */
export { inspectDocumentModelDefinition } from "./runtime/inspection.js";
/** @experimental Whether a module's structured definition can be served. */
export type {
  DocumentModelDefinitionInspection,
  InspectableDocumentModelModule,
} from "./runtime/inspection.js";
export { materialize } from "./runtime/materialize.js";
export type {
  ActionOf,
  CodeFirstDocumentModelModule,
  DocumentModelFamily,
  DocumentOf,
  GlobalStateOf,
  LocalStateOf,
} from "./runtime/types.js";
