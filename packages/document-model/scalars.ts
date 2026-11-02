export {
  scalarCatalog,
  documentModelScalars,
  getCatalogScalar,
} from "./src/scalars/catalog.js";
export { defineScalar } from "./src/scalars/define-scalar.js";
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
