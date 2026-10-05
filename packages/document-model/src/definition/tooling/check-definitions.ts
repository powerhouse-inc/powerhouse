import type {
  DefinitionCheckProfile,
  DefinitionCheckReport,
  DefinitionCompatibilitySelection,
  DefinitionDiagnostic,
  DefinitionPath,
  DefinitionSource,
  DocumentModelModule,
  PowerhouseScalarName,
  Sha256Digest,
  SubgraphDefinition,
} from "@powerhousedao/shared/document-model";
import { adaptCodeFirstDocumentModelSource } from "../adapters/code-first-document-model-source-adapter.js";
import type { NormalizedDocumentModelArtifact } from "../adapters/types.js";
import {
  compareDefinitionDiagnostics,
  createDiagnostic,
} from "../diagnostics.js";
import { compilationReportOf } from "../materialize.js";
import {
  isCatalogBinding,
  isReferenceableScalarName,
  SCALAR_CATALOG_NAMES,
} from "../scalars/catalog.js";
import { checkSubgraphDefinitionShape } from "../subgraph/wire-shape.js";
import {
  canonicalDigest,
  canonicalJson,
  compareCodeUnits,
  throwIfAborted,
} from "../primitives.js";
import {
  type DefinitionSourceLoader,
  structuredDiagnostics,
} from "./definition-source-loader.js";
import type {
  LoadedDefinition,
  LoadedDefinitionSet,
  LoadedScalar,
  SubgraphClass,
} from "./definition-source-types.js";
import { checkRetainedSerialization } from "./retained-serialization.js";

/**
 * `tsc` cannot run this check. A code-first declaration compiles while its
 * module evaluates, and `tsc` evaluates nothing, so a package that typechecks
 * can still carry a declaration that fails to compile, a retained stored string
 * that no longer matches its structure, or two values that claim one document
 * type. The CLI, the build gate, and tests all call this module, so none of
 * them can approve what another rejects.
 */

/** The result of the release generation's TypeScript build. */
export type TypecheckEvidence = {
  readonly ok: boolean;
  /** Compiler output for the report. The caller strips machine paths. */
  readonly summary?: string;
};

/** The result of importing the packed candidate output from consumers. */
export type PackedConsumerEvidence = {
  readonly ok: boolean;
  /** Which consumers ran, so an empty run cannot pass as a complete one. */
  readonly consumers: readonly string[];
  readonly summary?: string;
};

/**
 * Without this, a release check fails with PH-PKG-RELEASE-EVIDENCE-MISSING
 * instead of passing as an edit run would.
 */
export type ReleaseEvidenceProvider = {
  typecheck(request: {
    readonly packageRoot: string;
    readonly signal?: AbortSignal;
  }): Promise<TypecheckEvidence> | TypecheckEvidence;
  verifyPackedConsumers(request: {
    readonly packageRoot: string;
    readonly signal?: AbortSignal;
  }): Promise<PackedConsumerEvidence> | PackedConsumerEvidence;
};

export type HostValidationRequest = {
  readonly profile: DefinitionCheckProfile;
  /** The selected modules only. The host adds its core modules. */
  readonly documentModels: readonly DocumentModelModule[];
  readonly subgraphs: readonly LoadedDefinition<SubgraphClass>[];
  readonly signal?: AbortSignal;
};

export type HostValidationResult = {
  readonly completed: boolean;
  readonly diagnostics: readonly DefinitionDiagnostic[];
};

/**
 * Schema and composition checks the host owns. This package cannot depend on
 * `reactor-api`, so the CLI passes in `validateSubgraphsForHost`.
 */
export type HostValidationCallback = (
  request: HostValidationRequest,
) => Promise<HostValidationResult> | HostValidationResult;

export type DefinitionCheckRequest = {
  readonly profile: DefinitionCheckProfile;
  readonly loader: DefinitionSourceLoader;
  readonly packageRevision: Sha256Digest;
  readonly configFile?: string;
  readonly cliSources?: readonly string[];
  readonly warningsAsErrors?: boolean;
  readonly signal?: AbortSignal;
  readonly releaseEvidence?: ReleaseEvidenceProvider;
  readonly hostValidation?: HostValidationCallback;
};

/**
 * Codes and phases that mean the check could not run, as opposed to the
 * package being wrong. They produce exit 2 instead of exit 1, so a caller can
 * tell "fix your declaration" from "fix your environment".
 */
const TOOLING_FAILURE_CODES = new Set<string>([
  "PH-PKG-RELEASE-EVIDENCE-MISSING",
]);

const TOOLING_FAILURE_PHASES = new Set<string>([
  "configuration",
  "import",
  "typecheck",
]);

function dedupe(
  diagnostics: readonly DefinitionDiagnostic[],
): readonly DefinitionDiagnostic[] {
  const seen = new Set<string>();
  const unique: DefinitionDiagnostic[] = [];
  for (const entry of diagnostics) {
    const key = canonicalJson(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  return unique.sort(compareDefinitionDiagnostics);
}

function checkStoredMaterialization(
  artifact: NormalizedDocumentModelArtifact,
): readonly DefinitionDiagnostic[] {
  const stored = artifact.documentModel.global.specifications;
  const declared = artifact.definition.specifications;
  const definitionRef = {
    kind: "document-model" as const,
    key: artifact.documentType,
    version: artifact.version,
  };
  const storedVersions = stored.map((entry) => entry.version);
  const declaredVersions = declared.map((entry) => entry.version);
  if (canonicalJson(storedVersions) !== canonicalJson(declaredVersions)) {
    return [
      createDiagnostic({
        code: "PH-DM-DECLARATION-INVALID",
        source: artifact.source,
        definition: definitionRef,
        path: ["documentModel", "global", "specifications"],
        message:
          "The stored specification history and the structured definition cover different versions.",
        expected: canonicalJson(declaredVersions),
        received: canonicalJson(storedVersions),
        repair:
          "Materialize the module and its definition from one declaration; do not assemble either by hand.",
      }),
    ];
  }
  const diagnostics: DefinitionDiagnostic[] = [];
  declared.forEach((specification, index) => {
    const storedSpecification = stored[index];
    const scopes = [
      ["global", specification.state.global] as const,
      ["local", specification.state.local] as const,
    ];
    for (const [scope, state] of scopes) {
      const storedState = storedSpecification.state[scope];
      if (storedState.initialValue === state.materialized.initialValue) {
        continue;
      }
      diagnostics.push(
        createDiagnostic({
          code: "PH-DM-INITIAL-VALUE-INVALID",
          source: artifact.source,
          definition: definitionRef,
          path: [
            "documentModel",
            "global",
            "specifications",
            index,
            "state",
            scope,
            "initialValue",
          ],
          message: `The stored ${scope} initial value is not the one this definition materializes.`,
          expected: state.materialized.initialValue,
          received: storedState.initialValue,
          repair:
            "Publish the module the compiler returned; a stored initial value is not an independent setting.",
        }),
      );
    }
  });
  return diagnostics;
}

function checkDuplicateActionTypes(
  artifact: NormalizedDocumentModelArtifact,
): readonly DefinitionDiagnostic[] {
  const diagnostics: DefinitionDiagnostic[] = [];
  artifact.definition.specifications.forEach((specification, index) => {
    const owners = new Map<string, string>();
    for (const module of specification.modules) {
      for (const operation of module.operations) {
        const key = `${module.key}/${operation.key}`;
        const existing = owners.get(operation.actionType);
        if (existing === undefined) {
          owners.set(operation.actionType, key);
          continue;
        }
        diagnostics.push(
          createDiagnostic({
            code: "PH-DM-DUPLICATE-ACTION",
            source: artifact.source,
            definition: {
              kind: "document-model",
              key: artifact.documentType,
              version: specification.version,
            },
            path: [
              "specifications",
              index,
              "modules",
              module.key,
              operation.key,
            ],
            message: `Two operations persist the action type ${operation.actionType}, so a replayed history cannot say which reducer wrote it.`,
            expected: "one operation per persisted action type",
            received: `${existing} and ${key}`,
            repair: `Rename one of ${existing} and ${key} so the derived action types differ.`,
          }),
        );
      }
    }
  });
  return diagnostics;
}

function compatibilityOf(
  module: DocumentModelModule,
): DefinitionCompatibilitySelection | undefined {
  const report = compilationReportOf(module);
  if (report === undefined) return undefined;
  const { identity, serialization, paths } = report.compatibility;
  return {
    identity,
    serialization,
    paths: {
      ids: [...paths.ids].sort(compareCodeUnits),
      names: [...paths.names].sort(compareCodeUnits),
      serialization: [...paths.serialization].sort(compareCodeUnits),
    },
  };
}

type CheckedDefinition = DefinitionCheckReport["definitions"][number];

type Normalized = {
  readonly artifacts: readonly NormalizedDocumentModelArtifact[];
  readonly modules: readonly DocumentModelModule[];
  readonly definitions: readonly CheckedDefinition[];
  readonly diagnostics: readonly DefinitionDiagnostic[];
};

/**
 * Runs the checks both profiles share. A release run adds work after these and
 * never judges a declaration differently from an edit run.
 */
function normalizeLoadedDefinitions(loaded: LoadedDefinitionSet): Normalized {
  const artifacts: NormalizedDocumentModelArtifact[] = [];
  const modules: DocumentModelModule[] = [];
  const definitions: CheckedDefinition[] = [];
  const diagnostics: DefinitionDiagnostic[] = [];

  for (const entry of loaded.documentModels) {
    const normalized = adaptCodeFirstDocumentModelSource(
      entry.value,
      entry.source,
    );
    diagnostics.push(
      ...normalized.diagnostics.map((item) =>
        item.source === undefined ? { ...item, source: entry.source } : item,
      ),
    );
    if (
      normalized.artifacts.length > 0 &&
      normalized.diagnostics.every((item) => item.severity !== "error")
    ) {
      modules.push(entry.value);
    }
    for (const artifact of normalized.artifacts) {
      artifacts.push(artifact);
      diagnostics.push(
        ...checkRetainedSerialization(artifact).map((item) => ({
          ...item,
          source: artifact.source,
        })),
        ...checkStoredMaterialization(artifact),
        ...checkDuplicateActionTypes(artifact),
      );
      const compatibility = compatibilityOf(entry.value);
      definitions.push({
        kind: "document-model",
        key: artifact.documentType,
        version: artifact.version,
        digest: artifact.digest,
        source: artifact.source,
        ...(compatibility !== undefined && { compatibility }),
      });
    }
  }

  // A subgraph class from a package may have been compiled by another release,
  // so its published definition is shape-checked before it is reported.
  for (const entry of loaded.subgraphs) {
    const definition = (entry.value as { definition?: unknown }).definition;
    const shape = checkSubgraphDefinitionShape(definition, entry.path);
    diagnostics.push(
      ...shape.map((item: DefinitionDiagnostic) => ({
        ...item,
        source: entry.source,
      })),
      ...compileDiagnostics(entry),
    );
    if (shape.length > 0) continue;
    const published = definition as SubgraphDefinition;
    definitions.push({
      kind: "subgraph",
      key: published.name,
      digest: canonicalDigest(published),
      source: entry.source,
    });
  }

  for (const scalar of loaded.scalars) {
    const checked = checkExportedScalar(scalar);
    if (checked.kind === "definition") definitions.push(checked.definition);
    else diagnostics.push(checked.diagnostic);
  }
  diagnostics.push(...checkPackageScalarNames(artifacts, loaded.subgraphs));

  return { artifacts, modules, definitions, diagnostics };
}

/**
 * A diagnostics list this release cannot read, such as one with a code added
 * later, becomes one error so that a newer compiler's error is not dropped.
 */
function compileDiagnostics(
  entry: LoadedDefinitionSet["subgraphs"][number],
): readonly DefinitionDiagnostic[] {
  const rebuilt = structuredDiagnostics(entry.value, entry.source);
  if (rebuilt !== undefined) return rebuilt;
  const reported = (entry.value as { diagnostics?: unknown }).diagnostics;
  if (!Array.isArray(reported) || reported.length === 0) return [];
  return [
    createDiagnostic({
      code: "PH-SG-DEFINITION-INVALID",
      source: entry.source,
      path: [...entry.path, "diagnostics"],
      message: "This subgraph's compile diagnostics could not be read.",
      expected: "diagnostics from the V1 catalog",
      received: `${reported.length} diagnostics`,
      repair:
        "Rebuild the package with this release of document-model, then run the check again.",
    }),
  ];
}

/**
 * A hand-written scalar definition has no binding to validate or coerce with,
 * and a catalog scalar belongs to the compiler, so both get a diagnostic
 * instead of being skipped.
 */
function checkExportedScalar(
  scalar: LoadedDefinition<LoadedScalar>,
):
  | { readonly kind: "definition"; readonly definition: CheckedDefinition }
  | { readonly kind: "diagnostic"; readonly diagnostic: DefinitionDiagnostic } {
  const { name, binding } = scalar.value;
  const at = {
    source: scalar.source,
    definition: { kind: "scalar" as const, key: name },
    path: scalar.path,
    received: name,
  };
  if (binding === undefined) {
    return {
      kind: "diagnostic",
      diagnostic: createDiagnostic({
        ...at,
        code: "PH-SCALAR-AUTHOR-DECLARATION-UNSUPPORTED",
        message: `This source exports a scalar definition for ${name} that defineScalar did not compile, so nothing can validate or coerce its values.`,
        expected: "a factory defineScalar returned",
        repair: `Declare ${name} with defineScalar and export the factory it returns.`,
      }),
    };
  }
  if (isReferenceableScalarName(name)) {
    const reexported = isCatalogBinding(binding);
    return {
      kind: "diagnostic",
      diagnostic: reexported
        ? createDiagnostic({
            ...at,
            code: "PH-SCALAR-AUTHOR-DECLARATION-UNSUPPORTED",
            message: `This source exports the catalog scalar ${name} as its own; the catalog belongs to the compiler.`,
            expected: "a package scalar under a name outside the catalog",
            repair: `Remove the export and use the ph factory for ${name} where it is needed.`,
          })
        : createDiagnostic({
            ...at,
            code: "PH-SCALAR-DUPLICATE-NAME",
            message: `A package scalar is named ${name}, which is a ${SCALAR_CATALOG_NAMES.includes(name as PowerhouseScalarName) ? "catalog scalar" : "GraphQL built-in"}.`,
            repair: `Rename the scalar passed to defineScalar; the name ${name} is taken.`,
          }),
    };
  }
  return {
    kind: "definition",
    definition: {
      kind: "scalar",
      key: name,
      digest: canonicalDigest(binding.definition),
      source: scalar.source,
    },
  };
}

/**
 * One host serves every model and subgraph a package ships and declares each
 * scalar once, so two package scalars that share a name but not a definition
 * would collide when the host composes them.
 */
function checkPackageScalarNames(
  artifacts: readonly NormalizedDocumentModelArtifact[],
  subgraphs: readonly LoadedDefinition<SubgraphClass>[],
): readonly DefinitionDiagnostic[] {
  type Use = {
    readonly digest: Sha256Digest;
    readonly source: DefinitionSource;
    readonly path: DefinitionPath;
  };
  const uses: (Use & { readonly name: string })[] = [];
  for (const artifact of artifacts) {
    artifact.definition.specifications.forEach((specification, index) => {
      specification.scalars.forEach((scalar, scalarIndex) => {
        if (!("definition" in scalar)) return;
        uses.push({
          name: scalar.name,
          digest: canonicalDigest(scalar.definition),
          source: artifact.source,
          path: ["specifications", index, "scalars", scalarIndex],
        });
      });
    });
  }
  for (const entry of subgraphs) {
    const definition = (entry.value as { definition?: SubgraphDefinition })
      .definition;
    if (definition?.schemaKind !== "typed") continue;
    definition.scalars.forEach((scalar, scalarIndex) => {
      if (!("definition" in scalar)) return;
      uses.push({
        name: scalar.name,
        digest: canonicalDigest(scalar.definition),
        source: entry.source,
        path: [...entry.path, "definition", "scalars", scalarIndex],
      });
    });
  }

  const first = new Map<string, Use>();
  const diagnostics: DefinitionDiagnostic[] = [];
  for (const use of uses) {
    const known = first.get(use.name);
    if (known === undefined) {
      first.set(use.name, use);
      continue;
    }
    if (known.digest === use.digest) continue;
    diagnostics.push(
      createDiagnostic({
        code: "PH-SCALAR-DUPLICATE-NAME",
        source: use.source,
        definition: { kind: "scalar", key: use.name },
        path: use.path,
        message: `Two different package scalars are named ${use.name}.`,
        received: use.name,
        repair: `Declare ${use.name} once with defineScalar and import that factory everywhere it is used.`,
        related: [
          {
            source: known.source,
            path: known.path,
            message: `The other ${use.name} is used here.`,
          },
        ],
      }),
    );
  }
  return diagnostics;
}

function summaryOf(diagnostics: readonly DefinitionDiagnostic[]): {
  errors: number;
  warnings: number;
} {
  const errors = diagnostics.filter(
    (entry) => entry.severity === "error",
  ).length;
  return { errors, warnings: diagnostics.length - errors };
}

function statusOf(
  diagnostics: readonly DefinitionDiagnostic[],
  warningsAsErrors: boolean,
): "ok" | "invalid" | "failed" {
  if (
    diagnostics.some(
      (entry) =>
        TOOLING_FAILURE_PHASES.has(entry.phase) ||
        TOOLING_FAILURE_CODES.has(entry.code),
    )
  ) {
    return "failed";
  }
  const { errors, warnings } = summaryOf(diagnostics);
  // warningsAsErrors changes the status only. The report still lists a warning
  // as a warning.
  if (errors > 0 || (warningsAsErrors && warnings > 0)) return "invalid";
  return "ok";
}

export type DefinitionCheckReportInput = {
  readonly profile: DefinitionCheckProfile;
  readonly sourceSet: DefinitionCheckReport["sourceSet"];
  readonly definitions: readonly CheckedDefinition[];
  readonly diagnostics: readonly DefinitionDiagnostic[];
  readonly warningsAsErrors?: boolean;
  readonly skipped?: boolean;
};

/**
 * Throws when `skipped` is set on anything other than the explicit
 * schema-first selection with no sources, definitions, or diagnostics, because
 * `skipped` is the one status that means nothing was checked.
 */
export function createDefinitionCheckReport(
  input: DefinitionCheckReportInput,
): DefinitionCheckReport {
  const diagnostics = dedupe(input.diagnostics);
  if (input.skipped === true) {
    if (
      input.sourceSet.mode !== "schema-first" ||
      input.sourceSet.origin !== "config" ||
      input.sourceSet.sources.length > 0 ||
      diagnostics.length > 0 ||
      input.definitions.length > 0
    ) {
      throw new TypeError(
        "A skipped definition check is only the explicit schema-first selection: no sources, no definitions, and no diagnostics.",
      );
    }
    return {
      kind: "powerhouse.definition-check",
      formatVersion: 1,
      profile: input.profile,
      status: "skipped",
      skipReason: "explicit-schema-first-mode",
      sourceSet: input.sourceSet,
      definitions: [],
      diagnostics: [],
      summary: { errors: 0, warnings: 0 },
    };
  }
  return {
    kind: "powerhouse.definition-check",
    formatVersion: 1,
    profile: input.profile,
    status: statusOf(diagnostics, input.warningsAsErrors === true),
    sourceSet: input.sourceSet,
    definitions: [...input.definitions].sort(compareDefinitions),
    diagnostics,
    summary: summaryOf(diagnostics),
  };
}

function compareDefinitions(
  left: CheckedDefinition,
  right: CheckedDefinition,
): number {
  const kind = compareCodeUnits(left.kind, right.kind);
  if (kind !== 0) return kind;
  const key = compareCodeUnits(left.key, right.key);
  if (key !== 0) return key;
  return (left.version ?? 0) - (right.version ?? 0);
}

export function exitCodeFor(report: DefinitionCheckReport): 0 | 1 | 2 {
  switch (report.status) {
    case "ok":
    case "skipped":
      return 0;
    case "invalid":
      return 1;
    case "failed":
      return 2;
  }
}

async function releaseDiagnostics(
  request: DefinitionCheckRequest,
  packageRoot: string,
): Promise<readonly DefinitionDiagnostic[]> {
  const provider = request.releaseEvidence;
  if (provider === undefined) {
    return [
      createDiagnostic({
        code: "PH-PKG-RELEASE-EVIDENCE-MISSING",
        path: ["profile"],
        message:
          "A release check ran without the typecheck and packed-consumer work a release requires, so it cannot approve anything.",
        expected: "a release evidence provider",
        received: "none",
        repair:
          "Run the release check through ph build, ph model prepack, or ph publish, which supply that work.",
      }),
    ];
  }
  const diagnostics: DefinitionDiagnostic[] = [];
  const typecheck = await provider.typecheck({
    packageRoot,
    ...(request.signal !== undefined && { signal: request.signal }),
  });
  if (!typecheck.ok) {
    diagnostics.push(
      createDiagnostic({
        code: "PH-PKG-TYPECHECK-FAILED",
        path: ["typecheck"],
        message: "The TypeScript build of this generation did not succeed.",
        expected: "a clean TypeScript build",
        received: typecheck.summary ?? "the build reported errors",
        repair:
          "Fix the reported TypeScript errors; a release is never cut from a package that does not build.",
      }),
    );
  }
  throwIfAborted(request.signal, "The definition check");
  const packed = await provider.verifyPackedConsumers({
    packageRoot,
    ...(request.signal !== undefined && { signal: request.signal }),
  });
  if (!packed.ok || packed.consumers.length === 0) {
    diagnostics.push(
      createDiagnostic({
        code:
          packed.consumers.length === 0
            ? "PH-PKG-RELEASE-EVIDENCE-MISSING"
            : "PH-PKG-PACKED-CONSUMER-FAILED",
        path: ["packedConsumers"],
        message:
          packed.consumers.length === 0
            ? "The packed-consumer verification ran no consumer, so it proved nothing about the candidate."
            : "A packed consumer could not import the candidate output.",
        expected: "every packed consumer importing the candidate",
        received:
          packed.summary ??
          (packed.consumers.length === 0
            ? "no consumer ran"
            : packed.consumers.join(", ")),
        repair:
          "Repair the candidate output, or the consumer fixture, until a real packed import succeeds.",
      }),
    );
  }
  return diagnostics;
}

export type DefinitionCheckOutcome = {
  readonly report: DefinitionCheckReport;
  /**
   * The normalized document models the report describes, so a caller such as
   * `ph model inspect` does not load the sources a second time.
   */
  readonly artifacts: readonly NormalizedDocumentModelArtifact[];
};

export async function checkDefinitions(
  request: DefinitionCheckRequest,
): Promise<DefinitionCheckReport> {
  return (await checkDefinitionsWithArtifacts(request)).report;
}

/** A source that fails to load does not stop the others from being checked. */
export async function checkDefinitionsWithArtifacts(
  request: DefinitionCheckRequest,
): Promise<DefinitionCheckOutcome> {
  throwIfAborted(request.signal, "The definition check");
  const loaded = await request.loader.normalizeDefinitionSources({
    ...(request.configFile !== undefined && { configFile: request.configFile }),
    ...(request.cliSources !== undefined && {
      cliSources: request.cliSources,
    }),
    packageRevision: request.packageRevision,
    ...(request.signal !== undefined && { signal: request.signal }),
  });
  throwIfAborted(request.signal, "The definition check");

  if (loaded.status === "skipped") {
    return {
      report: createDefinitionCheckReport({
        profile: request.profile,
        sourceSet: loaded.sourceSet,
        definitions: [],
        diagnostics: [],
        skipped: true,
      }),
      artifacts: [],
    };
  }

  const normalized = normalizeLoadedDefinitions(loaded);
  const diagnostics: DefinitionDiagnostic[] = [
    ...loaded.diagnostics,
    ...normalized.diagnostics,
  ];

  if (loaded.subgraphs.length > 0) {
    if (request.hostValidation === undefined) {
      diagnostics.push(
        createDiagnostic({
          code: "PH-PKG-RELEASE-EVIDENCE-MISSING",
          path: ["hostValidation"],
          message:
            "This selection contains subgraphs, and the host-owned schema and composition checks did not run.",
          expected: "a host validation callback",
          received: "none",
          repair:
            "Run the check through a host that supplies subgraph validation.",
        }),
      );
    } else {
      const result = await request.hostValidation({
        profile: request.profile,
        documentModels: normalized.modules,
        subgraphs: loaded.subgraphs,
        ...(request.signal !== undefined && { signal: request.signal }),
      });
      diagnostics.push(...result.diagnostics);
      if (!result.completed) {
        diagnostics.push(
          createDiagnostic({
            code: "PH-PKG-RELEASE-EVIDENCE-MISSING",
            path: ["hostValidation"],
            message:
              "The host-owned subgraph validation did not finish, so its silence is not a pass.",
            expected: "a completed host validation",
            received: "an unfinished run",
            repair:
              "Repair the host validation callback and run the complete check again.",
          }),
        );
      }
    }
  }

  // Release evidence bundles a candidate and imports it from packed consumers.
  // It is skipped when the shared checks already failed, so a failing package
  // writes no candidate output.
  if (
    request.profile === "release" &&
    statusOf(diagnostics, request.warningsAsErrors === true) === "ok"
  ) {
    diagnostics.push(
      ...(await releaseDiagnostics(request, loaded.packageRoot)),
    );
  }
  throwIfAborted(request.signal, "The definition check");

  return {
    report: createDefinitionCheckReport({
      profile: request.profile,
      sourceSet: loaded.sourceSet,
      definitions: normalized.definitions,
      diagnostics,
      ...(request.warningsAsErrors !== undefined && {
        warningsAsErrors: request.warningsAsErrors,
      }),
    }),
    artifacts: normalized.artifacts,
  };
}

/** Callers recognize a superseded run by `name === "AbortError"`. */
function supersededError(): Error {
  const error = new Error("The definition check was superseded.");
  error.name = "AbortError";
  return error;
}

type Pending = {
  readonly key: string;
  readonly controller: AbortController;
  readonly promise: Promise<DefinitionCheckReport>;
};

/**
 * Runs one check at a time, and the newest request wins. A watch session sends
 * a request per keystroke, and without a generation counter an older run could
 * finish last and publish a report for source that no longer exists. Identical
 * requests share one execution, and a superseded request rejects with an
 * `AbortError`.
 */
export class DefinitionCheckSession {
  readonly #run: (
    request: DefinitionCheckRequest,
    signal: AbortSignal,
  ) => Promise<DefinitionCheckReport>;
  readonly #publish: (report: DefinitionCheckReport) => void;
  #pending: Pending | undefined;
  #generation = 0;

  constructor(options: {
    readonly run?: (
      request: DefinitionCheckRequest,
      signal: AbortSignal,
    ) => Promise<DefinitionCheckReport>;
    readonly publish?: (report: DefinitionCheckReport) => void;
  }) {
    this.#run =
      options.run ??
      ((request, signal) => checkDefinitions({ ...request, signal }));
    this.#publish = options.publish ?? (() => undefined);
  }

  request(
    request: Omit<DefinitionCheckRequest, "signal">,
  ): Promise<DefinitionCheckReport> {
    const key = canonicalJson({
      profile: request.profile,
      packageRevision: request.packageRevision,
      configFile: request.configFile ?? null,
      cliSources: request.cliSources ?? null,
      warningsAsErrors: request.warningsAsErrors ?? false,
    });
    const pending = this.#pending;
    if (pending !== undefined && pending.key === key) return pending.promise;
    pending?.controller.abort(supersededError());

    this.#generation += 1;
    const generation = this.#generation;
    const controller = new AbortController();
    const promise = this.#run(
      request as DefinitionCheckRequest,
      controller.signal,
    ).then(
      (report) => {
        if (generation === this.#generation) {
          this.#pending = undefined;
          this.#publish(report);
        }
        return report;
      },
      (error: unknown) => {
        // Cleared on failure too, so an identical later request, such as a save
        // that restores the same bytes, runs again instead of returning the old
        // failure.
        if (generation === this.#generation) this.#pending = undefined;
        throw error;
      },
    );
    // Callers still receive the rejection. This keeps one that nobody awaits
    // from being reported as unhandled.
    promise.catch(() => undefined);
    this.#pending = { key, controller, promise };
    return promise;
  }

  /** Cancels the running check and keeps its report from being published. */
  close(): void {
    this.#generation += 1;
    this.#pending?.controller.abort(supersededError());
    this.#pending = undefined;
  }
}
