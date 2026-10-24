import {
  SCALAR_DEFINITION,
  SCALAR_DEFINITION_VERSION,
  type ScalarDefinition,
} from "./types.js";

export function defineCatalogScalar<TName extends string, TValue>(
  input: Omit<ScalarDefinition<TName, TValue>, typeof SCALAR_DEFINITION>,
): ScalarDefinition<TName, TValue> {
  return Object.freeze({
    ...input,
    [SCALAR_DEFINITION]: SCALAR_DEFINITION_VERSION,
  } satisfies ScalarDefinition<TName, TValue>);
}
