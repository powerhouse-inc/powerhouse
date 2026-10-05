import type {
  DefinitionDiagnostic,
  LocationFreeGraphQLDocumentNode,
  SchemaFirstGraphQLDocumentCompatibility,
} from "@powerhousedao/shared/document-model";
import { parse } from "graphql";
import { DocumentModelDefinitionError } from "../diagnostics.js";
import { validateLocationFreeDocument } from "../graphql-ast.js";

/**
 * The compatibility helper for schema-first SDL outside the V1 descriptor
 * grammar. It lives behind the `tooling` subpath because it parses: calling an
 * SDL parser inside an authored module would also call it on every runtime
 * import of the finished package. An author pastes the plain location-free AST
 * this returns into the declaration, and the runtime accepts that data
 * directly — no generated AST file completes a declaration.
 */

type JsonLike = Record<string, unknown>;

/**
 * A deep copy without `loc` and without any property whose value is
 * `undefined`, so the result is exactly what the canonical encoder accepts.
 */
export function stripGraphQLLocations<T>(node: T): T {
  if (Array.isArray(node)) {
    const members = (node as readonly unknown[]).map((member) =>
      stripGraphQLLocations(member),
    );
    return members as unknown as T;
  }
  if (node === null || typeof node !== "object") return node;
  const stripped: JsonLike = {};
  for (const [key, value] of Object.entries(node as JsonLike)) {
    if (key === "loc" || value === undefined) continue;
    stripped[key] = stripGraphQLLocations(value);
  }
  return stripped as unknown as T;
}

/**
 * Parses the stored state and operation schema segments in their current
 * concatenation order and returns the location-free AST a declaration carries.
 */
export function schemaFirstGraphQLDocument(
  sdlSegments: readonly string[],
): SchemaFirstGraphQLDocumentCompatibility {
  const source = sdlSegments.join("\n");
  const document = stripGraphQLLocations(
    parse(source, { noLocation: true }),
  ) as unknown as LocationFreeGraphQLDocumentNode;
  const diagnostics = validateLocationFreeDocument(document, ["document"]);
  if (diagnostics.length > 0) {
    throw new DocumentModelDefinitionError(
      diagnostics as [DefinitionDiagnostic, ...DefinitionDiagnostic[]],
    );
  }
  return {
    kind: "graphql-ast-v1",
    document,
    preserveDefinitionOrder: true,
  };
}
