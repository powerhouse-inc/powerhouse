import type {
  DefinitionSource,
  Sha256Digest,
} from "@powerhousedao/shared/document-model";
import { canonicalDigest } from "../../kernel/primitives.js";
import { ROOT_TYPES } from "../../subgraph/projection.js";
import type { DefinitionInspectionReport } from "../inspect/types.js";
import { definitionStatus, sortedUniqueDiagnostics } from "../report/status.js";
import type { LoadedDefinitionProject } from "../report/types.js";
import type { SubgraphCheckInput } from "./input.js";

/** @experimental One subgraph, as `ph model inspect` prints it. */
export type SubgraphInspection =
  | {
      readonly style: "code-first";
      readonly name: string;
      readonly source: DefinitionSource;
      readonly digest: Sha256Digest;
      readonly hasSubscriptions: boolean;
      /** Schema coordinates of the entries, in entry order: `Query.x`, `Type.field`, or the abstract type a resolveType serves. */
      readonly entries: readonly string[];
      readonly types: readonly string[];
      readonly scalars: readonly {
        readonly name: string;
        readonly implementation: string;
      }[];
    }
  | {
      readonly style: "schema-first";
      readonly name: string | null;
      readonly source: DefinitionSource;
    };

/** @experimental An inspection report with the project's subgraphs. */
export type SubgraphInspectionReport = DefinitionInspectionReport & {
  readonly subgraphs: readonly SubgraphInspection[];
};

function coordinates(
  entries: SubgraphCheckInput["codeFirst"][number]["definition"]["entries"],
): readonly string[] {
  return entries.map((entry) => {
    switch (entry.kind) {
      case "query":
      case "mutation":
      case "subscription":
        return `${ROOT_TYPES[entry.kind]}.${entry.fieldName}`;
      case "computed-field":
        return `${entry.typeName}.${entry.fieldName}`;
      case "resolve-type":
      case "is-type-of":
        return entry.typeName;
    }
  });
}

/**
 * @experimental Adds the project's subgraphs to an inspection report: a
 * `subgraphs` section, the subgraph diagnostics, and a status that counts
 * them. A project whose only definitions are subgraphs is not skipped.
 */
export function withSubgraphInspection(
  project: LoadedDefinitionProject,
  report: DefinitionInspectionReport,
  subgraphs: SubgraphCheckInput,
): SubgraphInspectionReport {
  const diagnostics = sortedUniqueDiagnostics([
    ...report.diagnostics,
    ...subgraphs.diagnostics,
  ]);
  return {
    ...report,
    status: definitionStatus({
      ...(project.skipReason !== undefined && {
        skipReason: project.skipReason,
      }),
      definitions: [...project.artifacts, ...subgraphs.codeFirst],
      diagnostics,
    }),
    diagnostics,
    subgraphs: [
      ...subgraphs.codeFirst.map(
        ({ name, source, definition }): SubgraphInspection => ({
          style: "code-first",
          name,
          source,
          digest: canonicalDigest(definition),
          hasSubscriptions: definition.hasSubscriptions,
          entries: coordinates(definition.entries),
          types: definition.types.map((type) => type.name),
          scalars: definition.scalars.map(({ name, implementation }) => ({
            name,
            implementation,
          })),
        }),
      ),
      ...subgraphs.schemaFirst.map(({ name, source }): SubgraphInspection => ({
        style: "schema-first",
        name,
        source,
      })),
    ],
  };
}
