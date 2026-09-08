import type { SubgraphDefinitionV1 } from "@powerhousedao/shared/document-model";
import { toLocationFreeDocument } from "document-model/internal/subgraph";
import type { NormalizedDefinitionArtifact } from "document-model/tooling";
import { parse } from "graphql";
import { describe, expect, it } from "vitest";
import { validateSubgraphProfile } from "../src/graphql/subgraph-profile-validator.js";

type SubgraphArtifact = Extract<
  NormalizedDefinitionArtifact,
  { readonly kind: "subgraph" }
>;

function artifact(
  name: string,
  definition: SubgraphDefinitionV1,
): SubgraphArtifact {
  return {
    kind: "subgraph",
    key: name,
    digest: `sha256:${"a".repeat(64)}`,
    source: { specifier: `./src/${name}.ts` },
    definition,
  };
}

function compatibilityArtifact(name: string, sdl: string): SubgraphArtifact {
  return artifact(name, {
    kind: "powerhouse.subgraph",
    formatVersion: 1,
    name,
    compositionPolicy: "host-current",
    federationProfile: "host-current",
    schemaKind: "graphql-ast-compat",
    hasSubscriptions: false,
    document: toLocationFreeDocument(parse(sdl)),
    resolverCoordinates: [],
    access: "manual",
  });
}

describe("validateSubgraphProfile", () => {
  it("materializes and validates a typed standalone schema", async () => {
    const typed = artifact("typed", {
      kind: "powerhouse.subgraph",
      formatVersion: 1,
      name: "typed",
      compositionPolicy: "host-current",
      federationProfile: "host-current",
      schemaKind: "typed",
      hasSubscriptions: false,
      types: [],
      entries: [
        {
          kind: "query",
          key: "hello",
          fieldName: "hello",
          description: null,
          args: [],
          returns: { kind: "scalar", name: "String", required: false },
          access: { kind: "public" },
          compatibilityName: null,
        },
      ],
      scalars: [],
    });

    await expect(
      validateSubgraphProfile({ profile: "edit", artifacts: [typed] }),
    ).resolves.toEqual([]);
  });

  it("attributes standalone-schema failures to their artifact", async () => {
    const invalid = compatibilityArtifact(
      "invalid",
      "type Query { broken: MissingType }",
    );

    const diagnostics = await validateSubgraphProfile({
      profile: "edit",
      artifacts: [invalid],
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "PH-GQL-STANDALONE-SCHEMA-INVALID",
        phase: "composition",
        source: invalid.source,
        definition: { kind: "subgraph", key: "invalid" },
      }),
    ]);
  });

  it("does not run package composition for the edit profile", async () => {
    const first = compatibilityArtifact(
      "first",
      "type Query { shared: Shared } type Shared { value: String }",
    );
    const second = compatibilityArtifact(
      "second",
      "type Query { shared: Shared } type Shared { value: Int }",
    );

    await expect(
      validateSubgraphProfile({
        profile: "edit",
        artifacts: [first, second],
      }),
    ).resolves.toEqual([]);
  });

  it("runs one exact selected-set composition for the release profile", async () => {
    const first = compatibilityArtifact(
      "first",
      "type Query { shared: Shared } type Shared { value: String }",
    );
    const second = compatibilityArtifact(
      "second",
      "type Query { shared: Shared } type Shared { value: Int }",
    );

    const diagnostics = await validateSubgraphProfile({
      profile: "release",
      artifacts: [first, second],
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "PH-GQL-COMPOSITION-FAILED",
        phase: "composition",
        source: first.source,
        definition: { kind: "subgraph", key: "first" },
        related: [
          expect.objectContaining({
            source: second.source,
          }),
        ],
      }),
    ]);
  });
});
