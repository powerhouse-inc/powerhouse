import type {
  DefinitionDiagnostic,
  SubgraphDefinition,
} from "@powerhousedao/shared/document-model";
import { createDiagnostic } from "document-model";
import type {
  HostValidationRequest,
  HostValidationResult,
} from "document-model/tooling";
import { type DocumentNode, Kind } from "graphql";
import type { DefinedSubgraph } from "./define-subgraph.js";
import {
  buildPackageSubgraph,
  describeClaimContest,
  describeRefusedDocumentModel,
  describeSubgraphConflict,
  findPackageSubgraphConflicts,
  hostDocumentModels,
  type PackageSubgraph,
  type SubgraphWarning,
} from "./subgraph-types.js";

/**
 * Validates each code-first subgraph in a selection against the augmented
 * schema the host serves, then warns about each model and subgraph the server
 * would refuse or leave out of the supergraph. A subgraph that names a
 * host-declared type such as `OID` or `DocumentDrive` is valid, because the
 * host declares it. Each class is read through its static `definition`,
 * `typeDefs`, and `scalarResolvers`. Nothing is constructed, so no resolver
 * factory or `onSetup` runs.
 */
export function validateSubgraphsForHost(
  request: HostValidationRequest,
): HostValidationResult {
  const diagnostics: DefinitionDiagnostic[] = [];
  const host = hostDocumentModels(request.documentModels);
  for (const refused of host.refused) {
    diagnostics.push(
      createDiagnostic({
        ...describeRefusedDocumentModel(refused),
        definition: { kind: "document-model", key: refused.id },
        path: ["composition", refused.name],
        received: refused.name,
      }),
    );
  }

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

  // buildSubgraphSchema validates as it builds and throws, so building is the
  // check. validateSchema cannot run on the result, because @apollo/subgraph
  // loads graphql's CommonJS entry, this package loads the ESM entry, and
  // graphql checks type identity with instanceof.
  const { conflicts, contests } = findPackageSubgraphConflicts(
    candidates,
    host,
    {
      build: (candidate) =>
        buildPackageSubgraph(candidate, host, {
          resolvers: scalarResolversOf(candidate.entry.value),
          reportScalars: true,
        }),
      ...(request.signal !== undefined && { signal: request.signal }),
    },
  );
  for (const candidate of candidates) {
    const conflict = conflicts.get(candidate);
    if (conflict?.kind === "unbuildable") {
      const { entry } = candidate;
      const [{ code, message, repair }] = describeSubgraphConflict(
        candidate.name,
        conflict,
      );
      diagnostics.push(
        createDiagnostic({
          code,
          message,
          repair,
          source: entry.source,
          path: entry.path.map(String),
        }),
      );
      continue;
    }
    if (conflict !== undefined) {
      diagnostics.push(
        ...describeSubgraphConflict(candidate.name, conflict).map((warning) =>
          warningDiagnostic(candidate, warning),
        ),
      );
    }
    for (const contest of contests) {
      if (contest.claimants.includes(candidate)) {
        diagnostics.push(
          warningDiagnostic(candidate, describeClaimContest(contest)),
        );
      }
    }
  }

  return { completed: true, diagnostics };
}

type Candidate = PackageSubgraph & {
  readonly entry: HostValidationRequest["subgraphs"][number];
};

function warningDiagnostic(
  { name, entry }: Candidate,
  { claim, ...warning }: SubgraphWarning,
): DefinitionDiagnostic {
  return createDiagnostic({
    ...warning,
    source: entry.source,
    path:
      claim === undefined
        ? ["composition", name]
        : ["composition", name, claim],
    received: name,
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
