import {
  type DescribedScalarDefinition,
  SCALAR_DEFINITION,
  SCALAR_DEFINITION_VERSION,
} from "./types.js";

export function defineCatalogScalar<TName extends string, TValue>(
  input: Omit<
    DescribedScalarDefinition<TName, TValue>,
    typeof SCALAR_DEFINITION
  >,
): DescribedScalarDefinition<TName, TValue> {
  return Object.freeze({
    ...input,
    [SCALAR_DEFINITION]: SCALAR_DEFINITION_VERSION,
  } satisfies DescribedScalarDefinition<TName, TValue>);
}
