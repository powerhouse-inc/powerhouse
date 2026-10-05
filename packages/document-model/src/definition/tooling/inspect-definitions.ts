import type {
  DefinitionCheckReport,
  SubgraphDefinition,
  DefinitionDiagnostic,
  DefinitionSource,
  DocumentModelDefinition,
  ScalarDefinition,
  Sha256Digest,
} from "@powerhousedao/shared/document-model";
import { createDiagnostic } from "../diagnostics.js";
import { canonicalDigest, compareCodeUnits } from "../primitives.js";
import { scalarCatalog } from "../scalars/catalog.js";
import {
  checkDefinitionsWithArtifacts,
  type DefinitionCheckRequest,
} from "./check-definitions.js";

/**
 * Read-only answers about a compiled definition.
 *
 * Without this, reading the exact facts about a model means scraping printed
 * SDL or a formatted exception, and comparing two releases means diffing
 * prose. The envelope is canonical JSON, so `ph model inspect` output from two
 * releases can be diffed directly, and the definition inside it is byte-equal
 * to the golden the parity suite pins.
 *
 * These commands write nothing.
 */

/** How many keys an unknown-selector diagnostic names before it summarises. */
const MAX_LISTED_KEYS = 20;

export type DefinitionInspectionSelection = {
  readonly kind: "document-model";
  readonly key: string;
  readonly version: number;
};

export type DefinitionInspectionEnvelope = {
  readonly kind: "powerhouse.definition-inspection";
  readonly formatVersion: 1;
  readonly compilerVersion: string;
  readonly selection: DefinitionInspectionSelection;
  readonly sourceSet: DefinitionCheckReport["sourceSet"];
  readonly diagnostics: readonly DefinitionDiagnostic[];
} & (
  | {
      readonly status: "ok";
      readonly source: DefinitionSource;
      readonly digest: Sha256Digest;
      readonly definition: DocumentModelDefinition;
    }
  | { readonly status: "invalid" | "failed" | "skipped" }
);

export type ScalarInspectionEnvelope = {
  readonly kind: "powerhouse.scalar-inspection";
  readonly formatVersion: 1;
  readonly compilerVersion: string;
  readonly selection: { readonly kind: "scalar"; readonly key: string };
  readonly diagnostics: readonly DefinitionDiagnostic[];
} & (
  | {
      readonly status: "ok";
      /** The catalog, named without pretending it is a `./` definition source. */
      readonly source: { readonly catalog: "powerhouse.catalog" };
      readonly digest: Sha256Digest;
      readonly definition: ScalarDefinition;
    }
  | { readonly status: "invalid" }
);

export type DefinitionInspectionRequest = Omit<
  DefinitionCheckRequest,
  "profile" | "releaseEvidence"
> & {
  readonly compilerVersion: string;
  readonly selection: DefinitionInspectionSelection;
};

/**
 * Splits `<documentType>@<version>` at the final `@`.
 *
 * A document type is a slash-separated string that may itself contain `@`, so
 * splitting at the first one would silently inspect a different model.
 */
export function parseModelSelector(
  value: string,
):
  | { readonly ok: true; readonly key: string; readonly version: number }
  | { readonly ok: false; readonly message: string } {
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) {
    return {
      ok: false,
      message: `"${value}" is not <documentType>@<version>, as in "powerhouse/invoice@1".`,
    };
  }
  const version = value.slice(at + 1);
  if (!/^[1-9][0-9]*$/.test(version)) {
    return {
      ok: false,
      message: `"${version}" is not a version number; write the specification version, as in "@1".`,
    };
  }
  return { ok: true, key: value.slice(0, at), version: Number(version) };
}

/**
 * Loads the selected sources and returns the one definition asked for.
 *
 * It runs the same check the CLI runs, because an inspection of a definition
 * that does not compile would be an inspection of nothing. A failing check is
 * reported with its own status and diagnostics rather than a partial answer.
 */
export async function inspectDefinition(
  request: DefinitionInspectionRequest,
): Promise<DefinitionInspectionEnvelope> {
  const { report, artifacts } = await checkDefinitionsWithArtifacts({
    ...request,
    profile: "edit",
  });
  const base = {
    kind: "powerhouse.definition-inspection",
    formatVersion: 1,
    compilerVersion: request.compilerVersion,
    selection: request.selection,
    sourceSet: report.sourceSet,
  } as const;
  if (report.status !== "ok") {
    return { ...base, status: report.status, diagnostics: report.diagnostics };
  }

  const entry = report.definitions.find(
    (candidate) =>
      candidate.kind === "document-model" &&
      candidate.key === request.selection.key &&
      candidate.version === request.selection.version,
  );
  if (entry === undefined) {
    const available = report.definitions
      .map((candidate) => `${candidate.key}@${String(candidate.version ?? 1)}`)
      .sort(compareCodeUnits);
    // `expected` is capped, so a long list is shortened deliberately rather
    // than truncated mid-key by the cap.
    const listed =
      available.length <= MAX_LISTED_KEYS
        ? available.join(", ")
        : `${available.slice(0, MAX_LISTED_KEYS).join(", ")}, and ${String(available.length - MAX_LISTED_KEYS)} more`;
    return {
      ...base,
      status: "invalid",
      diagnostics: [
        createDiagnostic({
          code: "PH-DM-DECLARATION-INVALID",
          path: ["selection"],
          message: `This package publishes no ${request.selection.key} version ${String(request.selection.version)}.`,
          expected:
            available.length === 0
              ? "a selection that contains at least one document model"
              : listed,
          received: `${request.selection.key}@${String(request.selection.version)}`,
          repair:
            available.length === 0
              ? "Select the sources that declare this package's models."
              : `Inspect one of: ${listed}.`,
        }),
      ],
    };
  }

  // The artifact the check already normalised. Loading the sources again to
  // re-read `definition` would repeat the whole traversal — alias folding,
  // collision analysis, manifest coverage — and throw its diagnostics away.
  const artifact = artifacts.find(
    (candidate) =>
      candidate.documentType === request.selection.key &&
      candidate.version === request.selection.version,
  );
  if (artifact === undefined) {
    return { ...base, status: "failed", diagnostics: report.diagnostics };
  }
  return {
    ...base,
    status: "ok",
    source: artifact.source,
    digest: artifact.digest,
    definition: artifact.definition,
    diagnostics: report.diagnostics,
  };
}

/**
 * Reads the installed catalog. It needs no package, no config, and no source:
 * a catalog scalar belongs to the compiler. A package scalar travels inside
 * the definitions that use it, so `ph model inspect` shows it there.
 */
export function inspectScalar(request: {
  readonly name: string;
  readonly compilerVersion: string;
}): ScalarInspectionEnvelope {
  const base = {
    kind: "powerhouse.scalar-inspection",
    formatVersion: 1,
    compilerVersion: request.compilerVersion,
    selection: { kind: "scalar", key: request.name },
  } as const;
  const profile = scalarCatalog.validationProfiles[0];
  const binding = scalarCatalog.resolve(request.name, profile);
  if (binding === undefined) {
    return {
      ...base,
      status: "invalid",
      diagnostics: [
        createDiagnostic({
          code: "PH-SCALAR-UNREGISTERED",
          path: ["selection"],
          message: `The catalog has no scalar named ${request.name}.`,
          expected: [...scalarCatalog.names].sort(compareCodeUnits).join(", "),
          received: request.name,
          repair:
            "Inspect one of the catalog's scalars. A package scalar's definition is part of the model or subgraph that uses it: see ph model inspect or ph subgraph inspect.",
        }),
      ],
    };
  }
  return {
    ...base,
    status: "ok",
    source: { catalog: "powerhouse.catalog" },
    digest: canonicalDigest(binding.definition),
    definition: binding.definition,
    diagnostics: [],
  };
}

export type SubgraphInspectionSelection = {
  readonly kind: "subgraph";
  readonly key: string;
};

export type SubgraphInspectionEnvelope = {
  readonly kind: "powerhouse.subgraph-inspection";
  readonly formatVersion: 1;
  readonly compilerVersion: string;
  readonly selection: SubgraphInspectionSelection;
  readonly sourceSet: DefinitionCheckReport["sourceSet"];
} & (
  | {
      readonly status: "ok";
      readonly source: DefinitionSource;
      readonly digest: Sha256Digest;
      readonly definition: SubgraphDefinition;
      readonly diagnostics?: never;
    }
  | {
      readonly status: "invalid" | "failed" | "skipped";
      readonly diagnostics: readonly DefinitionDiagnostic[];
      readonly source?: never;
      readonly definition?: never;
    }
);

/**
 * Read-only answers about one compiled subgraph.
 *
 * The same shape as model inspection, for the same reason: the envelope is
 * canonical JSON, so `ph subgraph inspect` output from two releases can be
 * diffed directly instead of comparing prose. It writes nothing, constructs
 * no host, and calls no resolver factory.
 */
export async function inspectSubgraph(
  request: Omit<DefinitionInspectionRequest, "selection"> & {
    readonly selection: SubgraphInspectionSelection;
  },
): Promise<SubgraphInspectionEnvelope> {
  const { report } = await checkDefinitionsWithArtifacts({
    ...request,
    selection: undefined,
    profile: "edit",
  } as unknown as DefinitionCheckRequest);
  const base = {
    kind: "powerhouse.subgraph-inspection",
    formatVersion: 1,
    compilerVersion: request.compilerVersion,
    selection: request.selection,
    sourceSet: report.sourceSet,
  } as const;
  if (report.status !== "ok") {
    return { ...base, status: report.status, diagnostics: report.diagnostics };
  }

  const entry = report.definitions.find(
    (candidate) =>
      candidate.kind === "subgraph" && candidate.key === request.selection.key,
  );
  if (entry === undefined) {
    const available = report.definitions
      .filter((candidate) => candidate.kind === "subgraph")
      .map((candidate) => candidate.key)
      .sort(compareCodeUnits);
    return {
      ...base,
      status: "invalid",
      diagnostics: [
        createDiagnostic({
          code: "PH-SG-DEFINITION-INVALID",
          path: ["selection"],
          message: `No subgraph named ${request.selection.key} is in the selected sources.`,
          expected:
            available.length === 0
              ? "a selection containing a subgraph"
              : available.slice(0, MAX_LISTED_KEYS).join(", "),
          received: request.selection.key,
          repair:
            available.length === 0
              ? "Select a source that declares a subgraph."
              : "Inspect one of the subgraphs the selection contains.",
        }),
      ],
    };
  }

  // The report carries the identity and the digest; the definition itself is
  // read back off the loaded class, so the report's wire shape does not have
  // to grow a field only inspection reads.
  const loaded = await request.loader.normalizeDefinitionSources({
    ...(request.configFile !== undefined && { configFile: request.configFile }),
    ...(request.cliSources !== undefined && { cliSources: request.cliSources }),
    packageRevision: request.packageRevision,
    ...(request.signal !== undefined && { signal: request.signal }),
  });
  const published = loaded.subgraphs
    .map(
      (candidate) =>
        (candidate.value as { definition?: unknown }).definition as
          | SubgraphDefinition
          | undefined,
    )
    .find(
      (candidate): candidate is SubgraphDefinition =>
        candidate !== undefined &&
        candidate !== null &&
        typeof candidate === "object" &&
        candidate.name === request.selection.key,
    );
  if (published === undefined) {
    return {
      ...base,
      status: "failed",
      diagnostics: [
        createDiagnostic({
          code: "PH-SG-DEFINITION-INVALID",
          path: ["selection"],
          message: `The check reported ${request.selection.key}, but its definition could not be read back.`,
          repair: "Run the check again; if it persists, rebuild the package.",
        }),
      ],
    };
  }

  return {
    ...base,
    status: "ok",
    source: entry.source,
    digest: entry.digest as Sha256Digest,
    definition: published,
  };
}
