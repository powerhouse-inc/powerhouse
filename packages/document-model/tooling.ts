export {
  type DefinitionInspectionEnvelope,
  type DefinitionInspectionRequest,
  type DefinitionInspectionSelection,
  inspectDefinition,
  inspectScalar,
  parseModelSelector,
  type ScalarInspectionEnvelope,
} from "./src/definition/tooling/inspect-definitions.js";
export {
  compareDefinitionDiagnostics,
  formatDefinitionDiagnostic,
  sortDefinitionDiagnostics,
} from "./src/definition/diagnostics.js";
export {
  checkDefinitions,
  type DefinitionCheckOutcome,
  checkDefinitionsWithArtifacts,
  createDefinitionCheckReport,
  DefinitionCheckSession,
  type DefinitionCheckReportInput,
  type DefinitionCheckRequest,
  exitCodeFor,
  type HostValidationCallback,
  type HostValidationRequest,
  type HostValidationResult,
  type PackedConsumerEvidence,
  type ReleaseEvidenceProvider,
  type TypecheckEvidence,
} from "./src/definition/tooling/check-definitions.js";
export { DefinitionSourceLoader } from "./src/definition/tooling/definition-source-loader.js";
export { resolveDefinitionSelection } from "./src/definition/tooling/definition-source-resolution.js";
export type {
  DefinitionSourceLoadRequest,
  DefinitionSourceOrigin,
  DefinitionSourceResolution,
  DefinitionSourceSelectionRequest,
  DefinitionSourceSet,
  LoadedDefinition,
  LoadedDefinitionSet,
  SubgraphClass,
  TypeScriptSourceImportInterface,
} from "./src/definition/tooling/definition-source-types.js";
export {
  adaptSchemaFirstDocumentModelModule,
  SCHEMA_FIRST_EXAMPLE_KEY_PREFIX,
  type SchemaFirstAdapterOptions,
} from "./src/definition/tooling/adapters/schema-first-document-model-module-adapter.js";
export {
  checkScalarReferences,
  declaredTypeNames,
  type StructuredTypesFromDocument,
  structuredTypesFromDocument,
  type UnrepresentableNode,
} from "./src/definition/tooling/ast-to-structured.js";
export {
  schemaFirstGraphQLDocument,
  stripGraphQLLocations,
} from "./src/definition/tooling/graphql-document.js";
export { checkRetainedSerialization } from "./src/definition/tooling/retained-serialization.js";

// Code-first subgraphs. The host-agnostic half: `defineSubgraph` itself ships
// from `@powerhousedao/reactor-api`, which binds these to its own instance,
// request, and GraphQL types.
export {
  inspectSubgraph,
  type SubgraphInspectionEnvelope,
  type SubgraphInspectionSelection,
} from "./src/definition/tooling/inspect-definitions.js";
export { checkSubgraphDefinitionShape } from "./src/definition/subgraph/wire-shape.js";
export {
  compileSubgraph,
  type CompatSubgraphConfig,
  type CompiledSubgraph,
  type SubgraphConfig,
  type SubgraphConfigBase,
  type TypedSubgraphConfig,
} from "./src/definition/subgraph/definer.js";
export {
  compileSubgraphSchema,
  type SubgraphSchemaData,
} from "./src/definition/subgraph/ast.js";
export {
  compareResolverCoordinates,
  coordinatesOfResolverMap,
  normalizeCompatibility,
  runtimeHasSubscriptions,
  typeKindsOfDocument,
  type GraphQLAstCompatibility,
  type NormalizedCompatibility,
} from "./src/definition/subgraph/compatibility.js";
export {
  checkFederationSurface,
  composedSubgraphOf,
  directiveUsesOfDocument,
  reportCompositionPolicy,
  type ComposedSubgraph,
} from "./src/definition/subgraph/federation.js";
export {
  createEntryBuilders,
  isRegisteredEntry,
  readEntry,
  type EntryBuilders,
  type RegisteredEntry,
} from "./src/definition/subgraph/entries.js";
export type {
  ComputedToken,
  MaybePromise,
  ResolveTypeCall,
  ResolverCall,
  TypedSubgraphEntry,
} from "./src/definition/subgraph/types.js";
