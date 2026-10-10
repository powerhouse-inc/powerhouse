export {
  isReferenceableScalarName,
  scalarCatalog,
} from "./src/definition/scalars/catalog.js";
export {
  type Address,
  type Amount,
  type AmountWithNumberValue,
  type AmountWithStringValue,
  type AttachmentRef,
  scalarDeclarations,
} from "./src/definition/scalars/declarations/index.js";
export {
  orderedScalarNames,
  type ScalarStrings,
  scalarTypeScriptTypes,
  scalarZodSources,
} from "./src/definition/scalars/emit.js";
export type {
  AnyScalarDeclaration,
  ScalarCoercion,
  ScalarDeclaration,
} from "./src/definition/scalars/declaration.js";
export type { ScalarCatalogInterface } from "./src/definition/scalars/types.js";
