import type {
  DefinitionDiagnostic,
  DefinitionSource,
  SubgraphDefinition,
} from "@powerhousedao/shared/document-model";
import { createDiagnostic } from "document-model";
import type {
  HostValidationRequest,
  HostValidationResult,
} from "document-model/tooling";
import { type DocumentNode, Kind } from "graphql";
import { baseDocumentModels } from "../packages/base-document-models.js";
import { getUniqueDocumentModels } from "../packages/package-manager.js";
import { createSchema } from "../utils/create-schema.js";
import type { DefinedSubgraph } from "./define-subgraph.js";
import { isRootFieldClaim } from "./subgraph-type-ownership.js";
import {
  findPackageSubgraphConflicts,
  type PackageSubgraph,
  type PackageSubgraphConflicts,
} from "./subgraph-types.js";

/**
 * Validates each code-first subgraph in a selection against the augmented
 * schema the host serves, then warns about each one the server would refuse
 * for its name or leave out of the supergraph for a type or root field
 * another subgraph owns. A
 * subgraph that names a host-declared type such as `OID` or `DocumentDrive` is
 * valid, because the host declares it. Each class is read through its static
 * `definition`, `typeDefs`, and `scalarResolvers`. Nothing is constructed, so
 * no resolver factory or `onSetup` runs.
 */
export function validateSubgraphsForHost(
  request: HostValidationRequest,
): HostValidationResult {
  const diagnostics: DefinitionDiagnostic[] = [];
  const built: (PackageSubgraph & { source: DefinitionSource })[] = [];
  const documentModels = getUniqueDocumentModels(
    baseDocumentModels.map(([, model]) => model),
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

    built.push({ name: definition.name, typeDefs, source: entry.source });
  }

  const { conflicts } = findPackageSubgraphConflicts(
    built,
    request.documentModels,
  );
  for (const { name, source } of built) {
    const conflict = conflicts.get(name);
    if (conflict !== undefined) {
      diagnostics.push(...conflictDiagnostics(name, source, conflict));
    }
  }

  return { completed: true, diagnostics };
}

function conflictDiagnostics(
  name: string,
  source: DefinitionSource,
  conflict: PackageSubgraphConflicts,
): DefinitionDiagnostic[] {
  switch (conflict.kind) {
    case "name":
      return [
        createDiagnostic({
          code: "PH-SG-NAME-TAKEN",
          source,
          path: ["composition", name],
          message: `Subgraph "${name}" has the name of a ${conflict.heldBy} subgraph, so the server refuses it.`,
          received: name,
          repair: "Rename the subgraph.",
        }),
      ];
    case "generated":
      // createSchema reports these first, so a subgraph that redefines a
      // generated type never reaches this check.
      return conflict.claims.map(({ claim, owner }) =>
        createDiagnostic({
          code: "PH-SG-SCHEMA-INVALID",
          source,
          path: ["composition", name, claim],
          message: `${claim} belongs to "${owner}", so the server refuses subgraph "${name}".`,
          received: name,
          repair: `Rename ${claim} in this subgraph.`,
        }),
      );
    case "claims":
      return conflict.claims.map(({ claim, owner, ownerIsPackage }) => {
        const rootField = isRootFieldClaim(claim);
        return createDiagnostic({
          code: rootField
            ? "PH-GQL-COORDINATE-OWNED"
            : "PH-GQL-SHARED-DEFINITION-MISMATCH",
          source,
          path: ["composition", name, claim],
          message: ownerIsPackage
            ? `Subgraphs "${owner}" and "${name}" both declare ${claim}${rootField ? "" : ", differently"}, so the server leaves out of the supergraph whichever of them registers second.`
            : `${claim} belongs to "${owner}", so the server leaves subgraph "${name}" out of the supergraph.`,
          received: name,
          repair: ownerIsPackage
            ? `Rename ${claim} in one of the two subgraphs.`
            : rootField
              ? `Rename ${claim} in this subgraph.`
              : `Rename ${claim} in this subgraph, or define it exactly as "${owner}" does.`,
        });
      });
  }
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
