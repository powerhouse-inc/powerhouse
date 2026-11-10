import type {
  DefinitionCheckReport,
  DefinitionDiagnostic,
} from "@powerhousedao/shared/document-model";
import { isScalarDefinition } from "../../../scalars/types.js";
import { canonicalDigest, compareCodeUnits } from "../../kernel/primitives.js";
import { subgraphToolingDiagnostics } from "./diagnostic-codes.js";
import type { CodeFirstSubgraph, SubgraphDefinitions } from "./read.js";
import type { SchemaFirstSubgraphSource } from "./schema-first/sdl-conflicts.js";

/**
 * @experimental Everything the subgraph checks read: the code-first
 * subgraphs as their classes describe them, the text of the schema-first
 * ones, and the scalars the package exports.
 */
export type SubgraphCheckInput = {
  readonly codeFirst: readonly CodeFirstSubgraph[];
  readonly schemaFirst: readonly SchemaFirstSubgraphSource[];
  /**
   * The scalar names `scalars/index.ts` exports under their own name, sorted.
   * `undefined` when it was not read, which skips the scalar check.
   */
  readonly packageScalars: readonly string[] | undefined;
  /** Import, protocol and describe problems, and each description's own diagnostics. */
  readonly diagnostics: readonly DefinitionDiagnostic[];
  /** What a host's admission does with each code-first subgraph, as the caller replayed it; empty when it did not. */
  readonly hostConflicts: readonly SubgraphHostConflict[];
};

/**
 * @experimental A code-first subgraph a host would refuse or leave out, from
 * a replay of the host's admission: `nameHeldBy` when a built-in subgraph or
 * a document model's subgraph holds its name, and `claims` for the types and
 * root fields other subgraphs own, with their owners.
 */
export type SubgraphHostConflict = {
  readonly subgraph: string;
  readonly nameHeldBy?: "core" | "document model";
  readonly claims: readonly {
    readonly claim: string;
    readonly owner: string;
  }[];
};

/** @experimental A code-first subgraph's entry in the check report. */
export type SubgraphInventoryEntry =
  DefinitionCheckReport["definitions"][number];

/** A host registers a package scalar by the export bound under the scalar's own name. */
function exportedScalarNames(scalars: object): readonly string[] {
  return Object.entries(scalars)
    .flatMap(([exportName, value]) =>
      isScalarDefinition(value) && value.name === exportName
        ? [exportName]
        : [],
    )
    .sort(compareCodeUnits);
}

/** @experimental A package module the caller could not import, and why, in package-relative words. */
export type SubgraphImportFailure = {
  readonly specifier: `./${string}`;
  readonly reason: string;
};

function importFailed({
  specifier,
  reason,
}: SubgraphImportFailure): DefinitionDiagnostic {
  return subgraphToolingDiagnostics.create({
    code: "PH-IMPORT-FAILED",
    source: { specifier },
    path: [],
    message: `${specifier} could not be imported, so the subgraph checks that read it did not run.`,
    expected: "an importable TypeScript module",
    received: reason,
    repair: "Fix this module or one of its imports, then check again.",
  });
}

/**
 * @experimental Builds the subgraph check input and the inventory entries
 * once, for the check, inspection and release callers to share. `scalars`
 * is the namespace of `scalars/index.ts`: `null` when the package has none,
 * absent when the caller did not read it. `importFailures` names the
 * modules the caller could not import. `hostConflicts` is the caller's replay
 * of a host's admission of the code-first subgraphs.
 */
export function subgraphCheckInput(request: {
  readonly definitions: SubgraphDefinitions;
  readonly schemaFirst?: readonly SchemaFirstSubgraphSource[];
  readonly scalars?: object | null;
  readonly importFailures?: readonly SubgraphImportFailure[];
  readonly hostConflicts?: readonly SubgraphHostConflict[];
}): {
  readonly input: SubgraphCheckInput;
  readonly inventory: readonly SubgraphInventoryEntry[];
} {
  const { definitions, scalars } = request;
  return {
    input: {
      codeFirst: definitions.subgraphs,
      schemaFirst: request.schemaFirst ?? [],
      packageScalars:
        scalars === undefined
          ? undefined
          : scalars === null
            ? []
            : exportedScalarNames(scalars),
      diagnostics: [
        ...(request.importFailures ?? []).map(importFailed),
        ...definitions.diagnostics,
      ],
      hostConflicts: request.hostConflicts ?? [],
    },
    inventory: definitions.subgraphs.map(({ name, source, definition }) => ({
      kind: "subgraph",
      key: name,
      digest: canonicalDigest(definition),
      source,
    })),
  };
}
