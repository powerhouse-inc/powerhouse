import type {
  DefinitionDiagnostic,
  SubgraphDefinition,
} from "@powerhousedao/shared/document-model";
import { createDiagnostic } from "document-model";
import {
  composedSubgraphOf,
  reportCompositionPolicy,
  type ComposedSubgraph,
  type HostValidationRequest,
  type HostValidationResult,
} from "document-model/tooling";
import { type DocumentNode, Kind } from "graphql";
import { CORE_DOCUMENT_MODEL_MODULES } from "../packages/core-document-models.js";
import { getUniqueDocumentModels } from "../packages/package-manager.js";
import { createSchema } from "../utils/create-schema.js";
import type { DefinedSubgraph } from "./define-subgraph.js";

/**
 * Validates each code-first subgraph in a selection against the augmented
 * schema the host serves, then reports composition conflicts across them. A
 * subgraph that names a host-declared type such as `OID` or `DocumentDrive` is
 * valid, because the host declares it. Each class is read through its static
 * `definition`, `typeDefs`, and `scalarResolvers`. Nothing is constructed, so
 * no resolver factory or `onSetup` runs.
 */
export function validateSubgraphsForHost(
  request: HostValidationRequest,
): HostValidationResult {
  const diagnostics: DefinitionDiagnostic[] = [];
  const composed: ComposedSubgraph[] = [];
  const documentModels = getUniqueDocumentModels(
    Object.values(CORE_DOCUMENT_MODEL_MODULES),
    request.documentModels,
  );

  for (const entry of request.subgraphs) {
    request.signal?.throwIfAborted();
    const definition = subgraphDefinitionOf(entry.value);
    if (definition === null) continue;
    const at = { source: entry.source, path: entry.path.map(String) };

    const typeDefs = staticTypeDefsOf(entry.value);
    if (typeDefs === null) {
      diagnostics.push(
        createDiagnostic({
          code: "PH-SG-DEFINITION-INVALID",
          ...at,
          message: `Subgraph ${definition.name} publishes no type definitions the host can read.`,
          repair: "Rebuild the package with a matching compiler.",
        }),
      );
      continue;
    }

    // buildSubgraphSchema validates as it builds and throws, so building is
    // the check. validateSchema cannot run on the result, because
    // @apollo/subgraph loads graphql's CommonJS entry, this package loads the
    // ESM entry, and graphql checks type identity with instanceof.
    try {
      createSchema(documentModels, scalarResolversOf(entry.value), typeDefs);
    } catch (error) {
      diagnostics.push(
        createDiagnostic({
          code: "PH-SG-SCHEMA-INVALID",
          ...at,
          message: `${definition.name}: ${error instanceof Error ? error.message : String(error)}`,
          repair:
            "Fix the declaration so the augmented schema builds, or declare the missing type.",
        }),
      );
      // The host excludes a subgraph whose schema fails to build, so it
      // takes no part in composition.
      continue;
    }

    composed.push(composedSubgraphOf(definition));
  }

  if (composed.length > 1) {
    diagnostics.push(...reportCompositionPolicy(composed));
  }

  return { completed: true, diagnostics };
}

function subgraphDefinitionOf(value: unknown): SubgraphDefinition | null {
  if (typeof value !== "function") return null;
  const definition = (value as { definition?: unknown }).definition;
  if (definition === null || typeof definition !== "object") return null;
  const candidate = definition as Partial<SubgraphDefinition>;
  return candidate.kind === "powerhouse.subgraph" &&
    candidate.formatVersion === 1
    ? (definition as SubgraphDefinition)
    : null;
}

function staticTypeDefsOf(value: unknown): DocumentNode | null {
  const typeDefs = (value as { typeDefs?: unknown }).typeDefs;
  return typeDefs !== null &&
    typeof typeDefs === "object" &&
    (typeDefs as Partial<DocumentNode>).kind === Kind.DOCUMENT &&
    Array.isArray((typeDefs as Partial<DocumentNode>).definitions)
    ? (typeDefs as DocumentNode)
    : null;
}

function scalarResolversOf(value: unknown): DefinedSubgraph["scalarResolvers"] {
  const resolvers = (value as { scalarResolvers?: unknown }).scalarResolvers;
  return resolvers !== null && typeof resolvers === "object"
    ? (resolvers as DefinedSubgraph["scalarResolvers"])
    : {};
}
