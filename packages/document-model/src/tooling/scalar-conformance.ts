import type {
  PowerhouseScalarNameV1,
  ScalarGraphQLProfileV1,
} from "@powerhousedao/shared/document-model";
import {
  scalarCatalog,
  scalarCatalogReport,
  scalarEntries,
} from "../definition/scalars/index.js";
import type {
  ScalarCoercion,
  ScalarLiteralNode,
} from "../definition/scalars/types.js";

export type ScalarCatalogConformanceEntry = {
  readonly name: PowerhouseScalarNameV1;
  readonly definition: (typeof scalarEntries)[number]["definition"];
  readonly validationProfile: "document-engineering-1.40";
  readonly graphQLProfile: "legacy-graphql-default-v1";
  readonly validator: (typeof scalarEntries)[number]["binding"]["validator"];
  readonly installedCoercion: ScalarCoercion<unknown>;
  readonly typescriptType: string;
  readonly zodSource: string;
  readonly graphQLBinding:
    | { readonly kind: "default-identity" }
    | { readonly kind: "host-owned-last-write" };
};

/**
 * Test/tooling seam for the locked scalar compatibility suite. It is kept off
 * the author entry point so functions and validators never enter a stored
 * definition or the four-name author API.
 */
export function getScalarCatalogConformanceEntries(): readonly ScalarCatalogConformanceEntry[] {
  return scalarEntries.map((entry) => ({
    name: entry.definition.name,
    definition: entry.definition,
    validationProfile: "document-engineering-1.40",
    graphQLProfile: "legacy-graphql-default-v1",
    validator: entry.binding.validator,
    installedCoercion: entry.binding.coercion,
    typescriptType: entry.binding.typescriptType,
    zodSource: entry.binding.zodSource,
    graphQLBinding:
      entry.definition.name === "JSONObject"
        ? { kind: "host-owned-last-write" }
        : { kind: "default-identity" },
  }));
}

export function inspectScalarCatalogConformance() {
  return {
    names: scalarCatalog.names,
    validationProfiles: scalarCatalog.validationProfiles,
    graphQLProfiles: [
      "legacy-graphql-default-v1",
    ] as const satisfies readonly ScalarGraphQLProfileV1[],
    catalogDigest: scalarCatalog.digest,
    report: scalarCatalogReport,
  };
}

export type { ScalarLiteralNode };
