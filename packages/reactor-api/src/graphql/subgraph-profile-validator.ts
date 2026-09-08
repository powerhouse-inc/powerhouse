import { buildSubgraphSchema } from "@apollo/subgraph";
import type {
  DefinitionDiagnosticV1,
  SubgraphDefinitionV1,
} from "@powerhousedao/shared/document-model";
import {
  capCodePoints,
  canonicalJson,
  compareCodeUnits,
  type SubgraphProfileValidationRequest,
  type SubgraphProfileValidator,
} from "document-model/tooling";
import { buildTypedSubgraphDocument } from "document-model/internal/subgraph";
import type { DocumentNode } from "graphql";
import { composeSubgraphDefinitionsStrict } from "./gateway/adapter-gateway-apollo.js";
import type { SubgraphDefinition } from "./gateway/types.js";

type SubgraphArtifact = SubgraphProfileValidationRequest["artifacts"][number];

function orderArtifacts(
  artifacts: readonly SubgraphArtifact[],
): SubgraphArtifact[] {
  return [...artifacts].sort((left, right) =>
    compareCodeUnits(
      canonicalJson([
        left.source.specifier,
        left.source.exportPath ?? null,
        left.key,
        left.digest,
      ]),
      canonicalJson([
        right.source.specifier,
        right.source.exportPath ?? null,
        right.key,
        right.digest,
      ]),
    ),
  );
}

function typeDefsFromDefinition(
  definition: SubgraphDefinitionV1,
): DocumentNode {
  const document =
    definition.schemaKind === "typed"
      ? buildTypedSubgraphDocument(definition)
      : definition.document;
  return document as unknown as DocumentNode;
}

function failureSummary(error: unknown): string {
  try {
    return capCodePoints(
      error instanceof Error
        ? error.message
        : "Unknown Apollo validation error",
    );
  } catch {
    return "Unknown Apollo validation error";
  }
}

function standaloneDiagnostic(
  artifact: SubgraphArtifact,
  error: unknown,
): DefinitionDiagnosticV1 {
  return {
    code: "PH-GQL-STANDALONE-SCHEMA-INVALID",
    severity: "error",
    phase: "composition",
    source: artifact.source,
    definition: { kind: "subgraph", key: artifact.key },
    path: [],
    message: `Subgraph ${artifact.key} is not a valid standalone schema under the current Apollo profile.`,
    received: failureSummary(error),
    repair: "Repair the subgraph schema and rerun the definition check.",
  };
}

function compositionDiagnostic(
  artifacts: readonly SubgraphArtifact[],
  error: unknown,
): DefinitionDiagnosticV1 {
  const first = artifacts[0]!;
  return {
    code: "PH-GQL-COMPOSITION-FAILED",
    severity: "error",
    phase: "composition",
    source: first.source,
    definition: { kind: "subgraph", key: first.key },
    path: [],
    message:
      "The selected package subgraphs do not compose under the current Apollo profile.",
    received: failureSummary(error),
    repair:
      "Repair the conflicting subgraph definitions and rerun the release check.",
    ...(artifacts.length > 1
      ? {
          related: artifacts.slice(1).map((artifact) => ({
            source: artifact.source,
            path: [],
            message: `Selected subgraph ${artifact.key} participates in this composition.`,
          })),
        }
      : {}),
  };
}

/**
 * Run the host-owned Apollo checks for normalized package subgraphs without
 * starting a server or performing health/network requests. Both profiles build
 * every standalone schema; release additionally composes the selected set once.
 */
export const validateSubgraphProfile: SubgraphProfileValidator = async ({
  profile,
  artifacts,
}) => {
  const diagnostics: DefinitionDiagnosticV1[] = [];
  const subgraphs: SubgraphDefinition[] = [];
  const orderedArtifacts = orderArtifacts(artifacts);

  for (const artifact of orderedArtifacts) {
    const typeDefs = typeDefsFromDefinition(artifact.definition);
    try {
      buildSubgraphSchema([{ typeDefs }]);
      subgraphs.push({
        name: artifact.key,
        typeDefs,
        url: `http://localhost/${encodeURIComponent(artifact.key)}`,
      });
    } catch (error) {
      diagnostics.push(standaloneDiagnostic(artifact, error));
    }
  }

  if (
    profile === "release" &&
    diagnostics.length === 0 &&
    subgraphs.length > 0
  ) {
    try {
      await composeSubgraphDefinitionsStrict(subgraphs);
    } catch (error) {
      diagnostics.push(compositionDiagnostic(orderedArtifacts, error));
    }
  }

  return diagnostics;
};
