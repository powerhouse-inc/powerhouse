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
import {
  createSchema,
  SubgraphTypeCollisionError,
} from "../utils/create-schema.js";
import type { DefinedSubgraph } from "./define-subgraph.js";
import { isRootFieldClaim } from "./subgraph-type-ownership.js";
import {
  findPackageSubgraphConflicts,
  type PackageSubgraph,
  type PackageSubgraphConflicts,
  quotedNames,
} from "./subgraph-types.js";

/**
 * Validates each code-first subgraph in a selection against the augmented
 * schema the host serves, then warns about each one the server would refuse
 * or leave out of the supergraph. A subgraph that names a host-declared type
 * such as `OID` or `DocumentDrive` is valid, because the host declares it.
 * Each class is read through its static `definition`, `typeDefs`, and
 * `scalarResolvers`. Nothing is constructed, so no resolver factory or
 * `onSetup` runs.
 */
export function validateSubgraphsForHost(
  request: HostValidationRequest,
): HostValidationResult {
  const diagnostics: DefinitionDiagnostic[] = [];
  const documentModels = getUniqueDocumentModels(
    baseDocumentModels.map(([, model]) => model),
    request.documentModels,
  );

  const candidates: Candidate[] = [];
  for (const entry of request.subgraphs) {
    const definition = subgraphDefinitionOf(entry.value);
    if (definition === null) continue;
    const typeDefs = staticTypeDefsOf(entry.value);
    if (typeDefs === null) {
      diagnostics.push(
        createDiagnostic({
          code: "PH-SG-DEFINITION-INVALID",
          source: entry.source,
          path: entry.path.map(String),
          message: `Subgraph ${definition.name} publishes no type definitions the host can read.`,
          repair: "Rebuild the package with a matching compiler.",
        }),
      );
      continue;
    }
    candidates.push({ name: definition.name, typeDefs, entry });
  }

  // The server refuses a taken name or a redefined generated type before it
  // builds anything, so those are decided first.
  const admission = findPackageSubgraphConflicts(
    candidates,
    request.documentModels,
  ).conflicts;
  const built: Candidate[] = [];
  for (const candidate of candidates) {
    request.signal?.throwIfAborted();
    const { name, typeDefs, entry } = candidate;
    const refused = admission.get(candidate);
    if (refused !== undefined && refused.kind !== "claims") {
      diagnostics.push(...conflictDiagnostics(name, entry.source, refused));
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
        error instanceof SubgraphTypeCollisionError
          ? generatedTypeTaken(name, entry.source, error.typeNames)
          : createDiagnostic({
              code: "PH-SG-SCHEMA-INVALID",
              source: entry.source,
              path: entry.path.map(String),
              message: `${name}: ${error instanceof Error ? error.message : String(error)}`,
              repair:
                "Fix the declaration so the augmented schema builds, or declare the missing type.",
            }),
      );
      // The host excludes a subgraph whose schema fails to build, so it
      // takes no part in composition.
      continue;
    }
    built.push(candidate);
  }

  const { conflicts } = findPackageSubgraphConflicts(
    built,
    request.documentModels,
  );
  for (const candidate of built) {
    const conflict = conflicts.get(candidate);
    if (conflict !== undefined) {
      diagnostics.push(
        ...conflictDiagnostics(
          candidate.name,
          candidate.entry.source,
          conflict,
        ),
      );
    }
  }

  return { completed: true, diagnostics };
}

type Candidate = PackageSubgraph & {
  readonly entry: HostValidationRequest["subgraphs"][number];
};

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
      return [
        generatedTypeTaken(
          name,
          source,
          conflict.claims.map(({ claim }) => claim),
        ),
      ];
    case "claims":
      return conflict.claims.map((lost) => {
        const rootField = isRootFieldClaim(lost.claim);
        const code = rootField
          ? "PH-GQL-COORDINATE-OWNED"
          : "PH-GQL-SHARED-DEFINITION-MISMATCH";
        const at = { source, path: ["composition", name, lost.claim] };
        if (lost.kind === "owned") {
          return createDiagnostic({
            code,
            ...at,
            message: `${lost.claim} belongs to "${lost.owner}", so the server leaves subgraph "${name}" out of the supergraph.`,
            received: name,
            repair: rootField
              ? `Rename ${lost.claim} in this subgraph.`
              : `Rename ${lost.claim} in this subgraph, or define it exactly as "${lost.owner}" does.`,
          });
        }
        const { rivals } = lost;
        return createDiagnostic({
          code,
          ...at,
          message: rootField
            ? `Subgraphs ${quotedNames([name, ...rivals])} ${rivals.length === 1 ? "both" : "all"} declare ${lost.claim}, and only the one that registers first keeps it in the supergraph.`
            : `Subgraph "${name}" defines ${lost.claim} differently from ${quotedNames(rivals)}. The supergraph keeps it only in the subgraphs that define it as the first one to register does.`,
          received: name,
          repair: rootField
            ? `Declare ${lost.claim} in one subgraph only.`
            : `Make every definition of ${lost.claim} identical, or rename it where it differs.`,
        });
      });
  }
}

function generatedTypeTaken(
  name: string,
  source: DefinitionSource,
  typeNames: readonly string[],
): DefinitionDiagnostic {
  return createDiagnostic({
    code: "PH-SG-GENERATED-TYPE-TAKEN",
    source,
    path: ["composition", name],
    message: `Subgraph "${name}" defines ${typeNames.join(", ")}, which the document-model schema generates, so the server refuses it.`,
    received: name,
    repair: "Rename those types in this subgraph.",
  });
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
