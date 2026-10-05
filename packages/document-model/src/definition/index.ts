/**
 * The code-first document-model compiler. The normal author entry points are
 * `ph`, `defineScalar`, `defineDocumentModel`, and
 * `defineDocumentModelFamily`; the remaining exports are compiler internals
 * that tooling, hosts, and tests read.
 */

export { ph, type Ph } from "./field.js";
export { defineScalar } from "./scalars/define-scalar.js";
export type {
  ScalarCoercion,
  ScalarDeclaration,
} from "./scalars/declaration.js";
export {
  packageScalarNames,
  packageScalarsOf,
} from "./scalars/package-scalars.js";
// A field use's type names its scalar's value type, so a package that declares
// a model has to be able to name it too, or its declaration emit fails.
export type {
  Address,
  Amount,
  AmountWithNumberValue,
  AmountWithStringValue,
  AttachmentRef,
} from "./scalars/declarations/index.js";
export {
  literalFromJson,
  type ScalarLiteralNode,
} from "./scalars/scalar-literal.js";
export {
  type ActionForOperation,
  type ActionOf,
  type ActionsForOperationTokens,
  defineDocumentModel,
  defineDocumentModelFamily,
  type DocumentModelConfig,
  type DocumentModelContext,
  type DocumentModelFamily,
  type DocumentModelVersionConfig,
  type DocumentModelVersionDefinition,
  type DocumentOf,
  type EmptyLocalScopeDeclaration,
  type GlobalStateOf,
  type LocalStateOf,
  type ModelOperationBuilder,
  type ModelOperationConfig,
  type ModelOperationContext,
  type ModelOperationToken,
  type ModelModuleToken,
  type ModelState,
  type OperationErrorClasses,
  type StateScopeDeclaration,
} from "./model.js";
export { adaptCodeFirstDocumentModelSource } from "./adapters/code-first-document-model-source-adapter.js";
export { identityVectorsOf } from "./adapters/identity-vectors.js";
export type {
  DefinitionIdentityVector,
  NormalizedDocumentModelArtifact,
  NormalizedDocumentModelResult,
} from "./adapters/types.js";
export {
  CODE_FIRST_AUTHORING,
  type CodeFirstAuthoring,
  type InspectableDefinition,
  inspectableDefinition,
} from "./module-inspection.js";
export { checkDocumentModelDefinitionShape } from "./wire-shape.js";
export type { CompatibilitySelection } from "./compatibility-apply.js";
export {
  isSchemaFirstCompatibility,
  type ModuleNameOverrides,
  type NameOverrides,
  type OperationNameOverrides,
  schemaFirstSpecification,
  type SchemaFirstCompatibilityInput,
  type SchemaFirstSpecificationCompatibility,
} from "./compatibility.js";
export {
  assignStoredSegments,
  type SegmentOperation,
  type StoredSegments,
} from "./segments.js";
export {
  type CodeFirstDocumentModelModule,
  type CodeFirstRuntimeBehavior,
  compilationReportOf,
  createCodeFirstRuntimeBehavior,
  materializeCodeFirstModule,
  type ModuleCompilationReport,
} from "./materialize.js";
export {
  capCodePoints,
  compareDefinitionDiagnostics,
  compareDefinitionPaths,
  createDiagnostic,
  DEFINITION_DIAGNOSTIC_CODES,
  DefinitionDiagnosticCollector,
  type DefinitionDiagnosticCode,
  type DefinitionDiagnosticInput,
  DocumentModelDefinitionError,
  failDefinition,
  formatDefinitionDiagnostic,
  sortDefinitionDiagnostics,
} from "./diagnostics.js";
export {
  checkGraphQLDocumentAgreement,
  documentModelGraphQLProjection,
  type GraphQLProjection,
  validateLocationFreeDocument,
} from "./graphql-ast.js";
export {
  DOCUMENT_MODEL_IDENTITY_NAMESPACE,
  type DefinitionIdentityRequest,
  type DefinitionIdentityResult,
  definitionIdentityKey,
  deriveDefinitionId,
  IDENTITY_KEY_SEPARATOR,
  uuidV5,
} from "./identity.js";
export {
  checkDerivedNameCollisions,
  type DerivedModuleNames,
  type DerivedOperationNames,
  deriveDocumentModelErrorNames,
  deriveDocumentModelModuleNames,
  deriveDocumentModelNames,
  deriveDocumentModelOperationNames,
  type DocumentModelErrorNames,
  type DocumentModelModuleNames,
  type DocumentModelNames,
  type DocumentModelOperationNames,
} from "./naming.js";
export {
  canonicalDigest,
  canonicalJson,
  compareCodeUnits,
  isAuthoredSchemaName,
  isEnumValueName,
  isGraphQLName,
  isNFC,
  isSha256Digest,
  sha256,
} from "./primitives.js";
export {
  EMPTY_INPUT_FIELD_NAME,
  namedTypeInventory,
  type NamedTypeInventory,
  printNamedDefinition,
  printSchemaSegment,
  printTypeReference,
} from "./printer.js";
export {
  buildScalarCatalog,
  SCALAR_CATALOG_NAMES,
  scalarCatalog,
  scalarCatalogReport,
} from "./scalars/catalog.js";
export type {
  ScalarBinding,
  ScalarCatalogInterface,
  ScalarCatalogReport,
  ScalarFactory,
} from "./scalars/types.js";
export {
  compileDocumentModelVersion,
  type CompiledDocumentModelVersion,
  type CompiledModule,
  type CompiledOperation,
  type DefinitionExampleDeclaration,
  type DocumentModelCompilationConfig,
  type OperationErrorClass,
  type OperationErrorDeclaration,
  type RuntimeModuleDeclaration,
  type RuntimeOperationDeclaration,
} from "./structured.js";
export type {
  AnyDescriptor,
  AnyFieldDescriptor,
  AnyTypeDescriptor,
  EnumDescriptor,
  FieldDescriptor,
  FieldOptions,
  InputDescriptor,
  InputOf,
  InterfaceDescriptor,
  ListDescriptor,
  Mutable,
  ObjectDescriptor,
  ObjectFields,
  OutputOf,
  ReferenceDescriptor,
  ScalarDescriptor,
  SourceOf,
  StateRootDescriptor,
  TypeDescriptor,
  UnionDescriptor,
} from "./types.js";
export {
  buildValidator,
  type InitialValueResult,
  resolveReference,
  serializeAndValidateInitialValue,
  validatorFor,
  type ValidatorPosition,
} from "./zod.js";
