import type { StoredScalarDefinition } from "@powerhousedao/shared/document-model";
import type { ScalarDefinition } from "./types.js";

/** The metadata a stored definition records for a `defineScalar` binding. */
export function storedScalarDefinition(
  definition: ScalarDefinition,
): StoredScalarDefinition {
  return {
    kind: "powerhouse.scalar",
    formatVersion: 1,
    name: definition.name,
    representation: definition.representation ?? "json",
    description: definition.description ?? "",
    coercion: {
      source: definition.coercion === undefined ? "derived" : "explicit",
    },
    coercionProfile: "catalog-v1",
  };
}
