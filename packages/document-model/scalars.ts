export {
  scalarCatalog,
  documentModelScalars,
  getCatalogScalar,
} from "./src/scalars/catalog.js";
export { defineScalar } from "./src/scalars/define-scalar.js";
/**
 * @experimental A host that holds a package's `defineScalar` binding compares
 * it with the metadata a definition stores for that scalar.
 */
export { storedScalarDefinition } from "./src/scalars/stored-definition.js";
export {
  isScalarDefinition,
  scalarDefinitionVersion,
  SCALAR_DEFINITION_VERSION,
} from "./src/scalars/types.js";
export type {
  DescribedScalarDefinition,
  ScalarCoercion,
  ScalarDefinition,
  ScalarRepresentation,
  ScalarValue,
} from "./src/scalars/types.js";
export type { ScalarLiteralNode } from "./src/scalars/scalar-literal.js";
