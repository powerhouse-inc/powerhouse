import type { DocumentModelSpecificationDefinition } from "@powerhousedao/shared/document-model";
import { definitionIdentityKey } from "../identity.js";
import type { DefinitionIdentityVector } from "./types.js";

/**
 * Extracts every stable ID a specification carries, keyed by its identity
 * path. The order follows the definition: state examples, then each module,
 * its operations, and their errors and examples.
 *
 * An adapter reads these out of the definition it produced; it never
 * re-derives an ID to check one. Re-deriving here would only prove the
 * derivation agrees with itself.
 */
export function identityVectorsOf(
  specification: DocumentModelSpecificationDefinition,
  documentType: string,
): readonly DefinitionIdentityVector[] {
  const vectors: DefinitionIdentityVector[] = [];
  for (const scope of ["global", "local"] as const) {
    for (const example of specification.state[scope].examples) {
      vectors.push({
        key: definitionIdentityKey({
          kind: "state-example",
          documentType,
          scope,
          exampleKey: example.key,
        }),
        id: example.id,
      });
    }
  }
  for (const module of specification.modules) {
    vectors.push({
      key: definitionIdentityKey({
        kind: "module",
        documentType,
        moduleKey: module.key,
      }),
      id: module.id,
    });
    for (const operation of module.operations) {
      const coordinates = {
        documentType,
        moduleKey: module.key,
        operationKey: operation.key,
      } as const;
      vectors.push({
        key: definitionIdentityKey({ kind: "operation", ...coordinates }),
        id: operation.id,
      });
      for (const error of operation.errors) {
        vectors.push({
          key: definitionIdentityKey({
            kind: "error",
            ...coordinates,
            errorKey: error.key,
          }),
          id: error.id,
        });
      }
      for (const example of operation.examples) {
        vectors.push({
          key: definitionIdentityKey({
            kind: "operation-example",
            ...coordinates,
            exampleKey: example.key,
          }),
          id: example.id,
        });
      }
    }
  }
  return vectors;
}
