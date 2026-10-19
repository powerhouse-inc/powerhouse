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
export {
  findCodeFirstDefinitions,
  findUnregisteredDefinitions,
  type UnregisteredDefinition,
  unregisteredDefinitionDiagnostic,
} from "./src/definition/tooling/unregistered-definitions.js";
export type {
  DefinitionSourceLoadRequest,
  DefinitionSourceOrigin,
  DefinitionSourceResolution,
  DefinitionSourceSelectionRequest,
  DefinitionSourceSet,
  DescribedSubgraph,
  LoadedDefinition,
  LoadedDefinitionSet,
  LoadedSubgraphSet,
  SubgraphClass,
  SubgraphProtocolDescription,
  TypeScriptSourceImportInterface,
} from "./src/definition/tooling/definition-source-types.js";
export {
  isSubgraphClass,
  readSubgraphEntries,
  subgraphClassesIn,
  subgraphEntrySpecifiers,
  type SubgraphEntryNamespace,
} from "./src/definition/tooling/subgraph-reader.js";
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

export {
  inspectSubgraph,
  type SubgraphInspectionEnvelope,
  type SubgraphInspectionSelection,
} from "./src/definition/tooling/inspect-definitions.js";
export { checkSubgraphDefinitionShape } from "./src/definition/subgraph/wire-shape.js";
export {
  checkSubgraphDeterminism,
  checkSubgraphName,
  compileSubgraph,
  compileSubgraphTypeDefs,
  isSubgraphName,
  namelessSubgraphMessage,
  type CompiledSubgraph,
  type CompileSubgraphOptions,
  type SdlSchema,
  type SdlSchemaSpec,
  type SubgraphClassShape,
  type SubgraphSchema,
  type SubgraphSchemaBuilders,
} from "./src/definition/subgraph/definer.js";
export {
  compileSubgraphSchema,
  type SubgraphSchemaData,
} from "./src/definition/subgraph/ast.js";
export {
  compareResolverCoordinates,
  coordinatesOfResolverMap,
  normalizeCompatibility,
  typeKindsOfDocument,
  type GraphQLAstCompatibility,
  type NormalizedCompatibility,
} from "./src/definition/subgraph/compatibility.js";
export {
  checkFederationSurface,
  directiveUsesOfDocument,
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
