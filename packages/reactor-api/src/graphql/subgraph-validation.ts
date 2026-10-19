import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { createDiagnostic } from "document-model";
import type {
  HostValidationRequest,
  HostValidationResult,
} from "document-model/tooling";
import { type DocumentNode, GraphQLScalarType } from "graphql";
import {
  type DescribedSubgraphClass,
  describeSubgraphClass,
} from "./hosted-subgraph.js";
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
 * Validates each subgraph class in a selection against the augmented schema
 * the host serves, then warns about each model and subgraph the server would
 * refuse or leave out of the supergraph. The package's schema-first models
 * count beside the selected ones. A subgraph that names a host-declared type
 * such as `OID` or `DocumentDrive` is valid, because the host declares it.
 * Each class is read through the subgraph protocol's `describe()`. Nothing is
 * constructed, so no resolver factory or `onSetup` runs. A class the protocol
 * cannot describe is the tooling's to report.
 */
export function validateSubgraphsForHost(
  request: HostValidationRequest,
): HostValidationResult {
  request.signal?.throwIfAborted();
  const diagnostics: DefinitionDiagnostic[] = [];
  const host = hostDocumentModels([
    ...(request.schemaFirstDocumentModels ?? []),
    ...request.documentModels,
  ]);
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
    const described = describedOf(entry.value);
    if (described === undefined) continue;
    const { subgraphName, typeDefs } = described.description;
    candidates.push({
      name: subgraphName,
      typeDefs: typeDefs as DocumentNode,
      described,
      entry,
    });
  }

  // buildSubgraphSchema validates as it builds and throws, so building is the
  // check. validateSchema cannot run on the result: @apollo/subgraph requires
  // graphql's CommonJS entry, a bundler such as Vite can give this package
  // the ESM entry, and graphql checks type identity with instanceof.
  const { conflicts, contests } = findPackageSubgraphConflicts(
    candidates,
    host,
    (candidate) =>
      buildPackageSubgraph(candidate, host, {
        resolvers: packageScalarsOf(candidate.described),
        reportScalars: true,
      }),
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
  readonly described: DescribedSubgraphClass;
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

function describedOf(value: unknown): DescribedSubgraphClass | undefined {
  try {
    return describeSubgraphClass(value);
  } catch {
    return undefined;
  }
}

function packageScalarsOf({
  description,
}: DescribedSubgraphClass): Record<string, GraphQLScalarType> {
  return Object.fromEntries(
    description.scalarDefinitions.map(({ name }) => [
      name,
      new GraphQLScalarType({ name }),
    ]),
  );
}
