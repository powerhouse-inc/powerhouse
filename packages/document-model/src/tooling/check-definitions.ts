import type { DefinitionSource } from "@powerhousedao/shared/clis";
import type {
  DefinitionDiagnosticV1,
  DocumentModelModule,
  JsonValue,
  ScalarDefinitionV1,
  SubgraphDefinitionV1,
} from "@powerhousedao/shared/document-model";
import {
  CodeFirstDocumentModelSourceAdapter,
  LegacyDocumentModelModuleAdapter,
  type LegacyGraphQLDocumentParserInterface,
} from "../definition/adapters/index.js";
import {
  snapshotDataArray,
  snapshotDataRecord,
} from "../definition/data-properties.js";
import { getDocumentModelFamilyModules } from "../definition/model.js";
import { getCompiledSubgraphDefinition } from "../definition/subgraph/compiler.js";
import { normalizeSubgraphDefinition } from "../definition/subgraph/validation.js";
import {
  DefinitionDiagnosticError,
  failDefinition,
  sortDefinitionDiagnostics,
} from "../definition/diagnostics.js";
import {
  canonicalJson,
  compareCodeUnits,
  isRecord,
  sha256,
} from "../definition/primitives.js";
import type {
  DefinitionCheckEntry,
  DefinitionCheckReport,
  DefinitionNormalizationResult,
  DefinitionSourceDiagnostic,
  LoadedDefinitionCheckRequest,
  NormalizedDefinitionArtifact,
} from "./types.js";
import {
  subgraphCompositionPolicyDiagnostics,
  type SubgraphCompositionPolicyInput,
} from "./subgraph-composition-policy.js";

export type DefinitionCheckOptions = {
  readonly legacyGraphQLParser?: LegacyGraphQLDocumentParserInterface;
  readonly subgraphProfileValidator?: SubgraphProfileValidator;
};

export type SubgraphProfileValidationRequest = {
  readonly profile: LoadedDefinitionCheckRequest["profile"];
  readonly artifacts: readonly Extract<
    NormalizedDefinitionArtifact,
    { readonly kind: "subgraph" }
  >[];
};

/**
 * Host-owned validation for standalone schema and the exact composition work
 * required by the selected check profile. Core report-only policy diagnostics
 * run independently before this Adapter.
 */
export type SubgraphProfileValidator = (
  request: SubgraphProfileValidationRequest,
) =>
  | readonly DefinitionDiagnosticV1[]
  | Promise<readonly DefinitionDiagnosticV1[]>;

type CandidateContext = {
  readonly source: DefinitionSource;
  readonly path: readonly (string | number)[];
};

function sourceFromDiagnostic(
  diagnostic: DefinitionSourceDiagnostic,
): DefinitionDiagnosticV1 {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    phase: diagnostic.phase,
    ...(diagnostic.source ? { source: diagnostic.source } : {}),
    ...(diagnostic.definition ? { definition: diagnostic.definition } : {}),
    path: diagnostic.path,
    message: diagnostic.message,
    ...(diagnostic.expected ? { expected: diagnostic.expected } : {}),
    ...(diagnostic.received ? { received: diagnostic.received } : {}),
    repair: diagnostic.repair,
    ...(diagnostic.related ? { related: diagnostic.related } : {}),
  };
}

function diagnosticFromError(
  error: DefinitionDiagnosticError,
  context: CandidateContext,
): DefinitionDiagnosticV1 {
  return {
    code: error.code,
    severity: "error",
    phase: "definition",
    source: context.source,
    path: [...context.path, ...error.path],
    message: error.message,
    ...(error.expected ? { expected: error.expected } : {}),
    ...(error.received ? { received: error.received } : {}),
    repair: error.repair,
  };
}

function isLegacyDocumentModel(
  value: Readonly<Record<string, unknown>>,
): boolean {
  if (value.definition !== undefined) return false;
  return (
    snapshotDataRecord(value.documentModel).ok &&
    typeof value.reducer === "function" &&
    snapshotDataRecord(value.actions).ok &&
    snapshotDataRecord(value.utils).ok
  );
}

function claimedSubgraphDefinition(
  value: Readonly<Record<string, unknown>>,
): SubgraphDefinitionV1 | undefined {
  const definition = value.definition;
  return isRecord(definition) &&
    definition.kind === "powerhouse.subgraph" &&
    definition.formatVersion === 1
    ? (definition as SubgraphDefinitionV1)
    : undefined;
}

function claimsDocumentModelFamily(
  value: Readonly<Record<string, unknown>>,
): value is Record<string, unknown> & { readonly modules: readonly unknown[] } {
  return (
    snapshotDataArray(value.modules).ok &&
    snapshotDataRecord(value.upgradeManifest).ok &&
    typeof value.at === "function"
  );
}

function validateFamilyModules(
  value: Record<string, unknown>,
  adapter: CodeFirstDocumentModelSourceAdapter,
): readonly unknown[] {
  const inspectedModules = snapshotDataArray(value.modules);
  if (!inspectedModules.ok) {
    return failDefinition({
      code: "PH-DM-FAMILY-INVALID",
      path: ["modules"],
      message:
        "A document-model family must contain a stable array of version modules.",
      repair: "Export the complete result of defineDocumentModelFamily.",
    });
  }
  const modules = inspectedModules.value;
  if (
    modules.length === 0 ||
    modules.some((module) => !adapter.canAdapt(module))
  ) {
    return failDefinition({
      code: "PH-DM-FAMILY-INVALID",
      path: ["modules"],
      message:
        "A document-model family must contain finalized version modules.",
      repair: "Export the complete result of defineDocumentModelFamily.",
    });
  }
  const normalized = modules.map((module) => adapter.adapt(module));
  const first = normalized[0]!;
  for (let index = 0; index < normalized.length; index += 1) {
    const candidate = normalized[index]!;
    if (
      !Number.isSafeInteger(candidate.version) ||
      candidate.version < 1 ||
      candidate.documentType !== first.documentType ||
      candidate.version !== first.version + index ||
      canonicalJson(candidate.definition.model as unknown as JsonValue) !==
        canonicalJson(first.definition.model as unknown as JsonValue) ||
      canonicalJson(
        candidate.definition.compatibility as unknown as JsonValue,
      ) !==
        canonicalJson(first.definition.compatibility as unknown as JsonValue)
    ) {
      return failDefinition({
        code: "PH-DM-FAMILY-INVALID",
        path: ["modules", index],
        message:
          "Family modules must share model identity and compatibility in contiguous ascending versions.",
        repair:
          "Export every consecutive version from one defineDocumentModelFamily result.",
      });
    }
  }
  const inspectedManifest = snapshotDataRecord(value.upgradeManifest);
  if (!inspectedManifest.ok) {
    return failDefinition({
      code: "PH-DM-FAMILY-INVALID",
      path: ["upgradeManifest"],
      message: "A document-model family must expose a stable upgrade manifest.",
      repair:
        "Export the upgrade manifest created with the same family modules.",
    });
  }
  const manifest = inspectedManifest.value;
  const supportedVersions = normalized.map(({ version }) => version);
  const inspectedSupportedVersions = snapshotDataArray(
    manifest.supportedVersions,
  );
  const inspectedUpgrades = snapshotDataRecord(manifest.upgrades);
  if (
    manifest.documentType !== first.documentType ||
    manifest.latestVersion !== supportedVersions.at(-1) ||
    !inspectedSupportedVersions.ok ||
    inspectedSupportedVersions.value.length !== supportedVersions.length ||
    inspectedSupportedVersions.value.some(
      (version, index) => version !== supportedVersions[index],
    ) ||
    !inspectedUpgrades.ok
  ) {
    return failDefinition({
      code: "PH-DM-FAMILY-INVALID",
      path: ["upgradeManifest"],
      message:
        "The family upgrade manifest does not match its version modules.",
      repair:
        "Export the upgrade manifest created with the same family modules.",
    });
  }
  const expectedUpgradeKeys = supportedVersions
    .slice(1)
    .map((version) => `v${version}`)
    .sort(compareCodeUnits);
  const actualUpgradeKeys = Object.keys(inspectedUpgrades.value).sort(
    compareCodeUnits,
  );
  if (
    actualUpgradeKeys.length !== expectedUpgradeKeys.length ||
    actualUpgradeKeys.some((key, index) => key !== expectedUpgradeKeys[index])
  ) {
    return failDefinition({
      code: "PH-DM-FAMILY-INVALID",
      path: ["upgradeManifest", "upgrades"],
      message:
        "The family upgrade manifest contains missing or unexpected transitions.",
      repair: "Export exactly one transition for each version after the first.",
    });
  }
  for (const version of supportedVersions.slice(1)) {
    const inspectedTransition = snapshotDataRecord(
      inspectedUpgrades.value[`v${version}`],
    );
    const transition = inspectedTransition.ok
      ? inspectedTransition.value
      : undefined;
    if (
      !isRecord(transition) ||
      transition.toVersion !== version ||
      typeof transition.upgradeReducer !== "function" ||
      (transition.description !== undefined &&
        typeof transition.description !== "string")
    ) {
      return failDefinition({
        code: "PH-DM-FAMILY-INVALID",
        path: ["upgradeManifest", "upgrades", `v${version}`],
        message: `The family is missing its upgrade transition to version ${version}.`,
        repair:
          "Export the complete manifest returned by defineDocumentModelFamily.",
      });
    }
  }
  return modules;
}

function scalarDefinition(value: Readonly<Record<string, unknown>>):
  | {
      readonly name: string;
      readonly definition: ScalarDefinitionV1;
    }
  | undefined {
  if (
    value.kind !== "powerhouse.scalar" ||
    value.formatVersion !== 1 ||
    typeof value.name !== "string"
  ) {
    return undefined;
  }
  return {
    name: value.name,
    definition: value as unknown as ScalarDefinitionV1,
  };
}

function logicalKey(entry: DefinitionCheckEntry): string {
  return `${entry.kind}\u0000${entry.key}\u0000${entry.version ?? ""}`;
}

function compareEntries(
  left: DefinitionCheckEntry,
  right: DefinitionCheckEntry,
): number {
  const source = compareCodeUnits(
    canonicalJson(left.source as unknown as JsonValue),
    canonicalJson(right.source as unknown as JsonValue),
  );
  if (source !== 0) return source;
  const kind = compareCodeUnits(left.kind, right.kind);
  if (kind !== 0) return kind;
  const key = compareCodeUnits(left.key, right.key);
  if (key !== 0) return key;
  return (left.version ?? 0) - (right.version ?? 0);
}

export function normalizeDefinitions(
  request: LoadedDefinitionCheckRequest,
  options: DefinitionCheckOptions = {},
): DefinitionNormalizationResult {
  const { loadResult } = request;
  if (loadResult.status === "skipped") {
    return {
      report: {
        kind: "powerhouse.definition-check",
        formatVersion: 1,
        profile: request.profile,
        status: "skipped",
        skipReason: "explicit-legacy-mode",
        sourceSet: loadResult.sourceSet,
        definitions: [],
        diagnostics: [],
        summary: { errors: 0, warnings: 0 },
      },
      artifacts: [],
    };
  }

  const diagnostics: DefinitionDiagnosticV1[] =
    loadResult.diagnostics.map(sourceFromDiagnostic);
  const definitions: DefinitionCheckEntry[] = [];
  const artifacts: NormalizedDefinitionArtifact[] = [];
  const subgraphPolicyInputs: SubgraphCompositionPolicyInput[] = [];
  const logicalDefinitions = new Map<
    string,
    { readonly entry: DefinitionCheckEntry; readonly context: CandidateContext }
  >();
  const codeFirstAdapter = new CodeFirstDocumentModelSourceAdapter();
  const legacyAdapter = options.legacyGraphQLParser
    ? new LegacyDocumentModelModuleAdapter(options.legacyGraphQLParser)
    : undefined;

  function addDefinition(
    artifact: NormalizedDefinitionArtifact,
    context: CandidateContext,
  ): void {
    const entry: DefinitionCheckEntry = {
      kind: artifact.kind,
      key: artifact.key,
      ...(artifact.kind === "document-model"
        ? { version: artifact.version }
        : {}),
      digest: artifact.digest,
      source: artifact.source,
    };
    definitions.push(entry);
    artifacts.push(artifact);
    if (artifact.kind === "subgraph") {
      subgraphPolicyInputs.push({
        source: artifact.source,
        path: context.path,
        definition: artifact.definition,
      });
    }
    const key = logicalKey(entry);
    const existing = logicalDefinitions.get(key);
    if (existing) {
      diagnostics.push({
        code: "PH-PKG-LOGICAL-COLLISION",
        severity: "error",
        phase: "package",
        source: context.source,
        definition: {
          kind: entry.kind,
          key: entry.key,
          ...(entry.version === undefined ? {} : { version: entry.version }),
        },
        path: context.path,
        message: `More than one selected value declares ${entry.key}${entry.version === undefined ? "" : ` version ${entry.version}`}.`,
        repair:
          "Select one canonical export for each logical definition and remove the duplicate source.",
        related: [
          {
            source: existing.entry.source,
            path: existing.context.path,
            message: "The first declaration of this logical key is here.",
          },
        ],
      });
    } else {
      logicalDefinitions.set(key, { entry, context });
    }
  }

  function visit(
    value: unknown,
    context: CandidateContext,
    seen: WeakSet<object>,
  ): number {
    if (
      (typeof value === "object" || typeof value === "function") &&
      value !== null
    ) {
      if (seen.has(value)) return 0;
      seen.add(value);
    }

    try {
      const familyModules = getDocumentModelFamilyModules(value);
      if (familyModules) {
        return familyModules.reduce(
          (count, module, index) =>
            count +
            visit(
              module,
              { ...context, path: [...context.path, "modules", index] },
              seen,
            ),
          0,
        );
      }
      let arraySnapshot: readonly unknown[] | undefined;
      let recordSnapshot: Readonly<Record<string, unknown>> | undefined;
      if (typeof value === "object" && value !== null) {
        const inspectedArray = snapshotDataArray(value);
        if (inspectedArray.ok) {
          arraySnapshot = inspectedArray.value;
        } else if (inspectedArray.reason !== "not-array") {
          throw new TypeError(
            "The selected array could not be inspected safely.",
          );
        } else {
          const inspectedRecord = snapshotDataRecord(value);
          if (inspectedRecord.ok) {
            recordSnapshot = inspectedRecord.value;
          } else if (inspectedRecord.reason !== "custom-prototype") {
            throw new TypeError(
              "The selected object could not be inspected safely.",
            );
          }
        }
      } else if (typeof value === "function") {
        const inspectedRecord = snapshotDataRecord(value, {
          allowFunction: true,
          allowCustomPrototype: true,
          ignoreNonEnumerable: true,
        });
        if (!inspectedRecord.ok) {
          throw new TypeError(
            "The selected callable could not be inspected safely.",
          );
        }
        recordSnapshot = inspectedRecord.value;
      }

      if (recordSnapshot && claimsDocumentModelFamily(recordSnapshot)) {
        return validateFamilyModules(
          recordSnapshot,
          codeFirstAdapter,
        ).reduce<number>(
          (count, module, index) =>
            count +
            visit(
              module,
              { ...context, path: [...context.path, "modules", index] },
              seen,
            ),
          0,
        );
      }

      if (recordSnapshot && codeFirstAdapter.canAdapt(recordSnapshot)) {
        const normalized = codeFirstAdapter.adapt(recordSnapshot);
        addDefinition(
          {
            kind: "document-model",
            key: normalized.documentType,
            version: normalized.version,
            digest: normalized.digest,
            source: context.source,
            definition: normalized.definition,
          },
          context,
        );
        return 1;
      }

      if (recordSnapshot && isLegacyDocumentModel(recordSnapshot)) {
        if (!legacyAdapter) {
          diagnostics.push({
            code: "PH-DM-LEGACY-PARSER-MISSING",
            severity: "error",
            phase: "import",
            source: context.source,
            path: context.path,
            message:
              "A legacy document model requires the host GraphQL parser Adapter.",
            repair:
              "Supply legacyGraphQLParser when checking a source that exports legacy modules.",
          });
          return 0;
        }
        const normalized = legacyAdapter.adapt(
          recordSnapshot as unknown as DocumentModelModule,
        );
        addDefinition(
          {
            kind: "document-model",
            key: normalized.documentType,
            version: normalized.version,
            digest: normalized.digest,
            source: context.source,
            definition: normalized.definition,
          },
          context,
        );
        return 1;
      }

      const subgraphCandidate =
        getCompiledSubgraphDefinition(value) ??
        (recordSnapshot
          ? claimedSubgraphDefinition(recordSnapshot)
          : undefined);
      if (subgraphCandidate) {
        const subgraph = normalizeSubgraphDefinition(subgraphCandidate);
        addDefinition(
          {
            kind: "subgraph",
            key: subgraph.name,
            digest: sha256(canonicalJson(subgraph as unknown as JsonValue)),
            source: context.source,
            definition: subgraph,
          },
          context,
        );
        return 1;
      }

      const scalar = recordSnapshot
        ? scalarDefinition(recordSnapshot)
        : undefined;
      if (scalar) {
        addDefinition(
          {
            kind: "scalar",
            key: scalar.name,
            digest: sha256(
              canonicalJson(scalar.definition as unknown as JsonValue),
            ),
            source: context.source,
            definition: scalar.definition,
          },
          context,
        );
        diagnostics.push({
          code: "PH-SCALAR-AUTHOR-DECLARATION-UNSUPPORTED",
          severity: "error",
          phase: "definition",
          source: context.source,
          definition: { kind: "scalar", key: scalar.name },
          path: context.path,
          message: `Public source declares compiler-owned scalar ${scalar.name}.`,
          repair:
            "Remove the scalar declaration and use the matching ph scalar factory.",
        });
        return 1;
      }

      if (arraySnapshot) {
        return arraySnapshot.reduce<number>(
          (count, child, index) =>
            count +
            visit(child, { ...context, path: [...context.path, index] }, seen),
          0,
        );
      }
      if (recordSnapshot) {
        return Object.keys(recordSnapshot)
          .sort(compareCodeUnits)
          .reduce(
            (count, key) =>
              count +
              visit(
                recordSnapshot[key],
                { ...context, path: [...context.path, key] },
                seen,
              ),
            0,
          );
      }
      return 0;
    } catch (error) {
      let isDefinitionDiagnostic = false;
      try {
        isDefinitionDiagnostic = error instanceof DefinitionDiagnosticError;
      } catch {
        // A thrown Proxy is not a trustworthy structured diagnostic.
      }
      if (isDefinitionDiagnostic) {
        diagnostics.push(
          diagnosticFromError(error as DefinitionDiagnosticError, context),
        );
        return 0;
      }
      diagnostics.push({
        code: "PH-PKG-DEFINITION-INVALID",
        severity: "error",
        phase: "package",
        source: context.source,
        path: context.path,
        message: "The selected definition export could not be inspected.",
        repair:
          "Export plain definitions and collections without getters, Proxies, or other property-read side effects.",
      });
      return 0;
    }
  }

  for (const loaded of loadResult.values) {
    const count = visit(
      loaded.value,
      { source: loaded.source, path: [] },
      new WeakSet(),
    );
    const sourceHasDiagnostic = diagnostics.some(
      (diagnostic) =>
        diagnostic.source !== undefined &&
        canonicalJson(diagnostic.source as unknown as JsonValue) ===
          canonicalJson(loaded.source as unknown as JsonValue),
    );
    if (count === 0 && !sourceHasDiagnostic) {
      diagnostics.push({
        code: "PH-PKG-DEFINITION-UNRECOGNIZED",
        severity: "error",
        phase: "package",
        source: loaded.source,
        path: [],
        message: "The selected source contains no finalized definition.",
        repair:
          "Select a finalized document model, family, subgraph, or an explicit collection containing them.",
      });
    }
  }

  diagnostics.push(
    ...subgraphCompositionPolicyDiagnostics(subgraphPolicyInputs),
  );

  definitions.sort(compareEntries);
  const orderedDiagnostics = sortDefinitionDiagnostics(diagnostics);
  const errors = orderedDiagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  ).length;
  const warnings = orderedDiagnostics.length - errors;
  const failed = orderedDiagnostics.some((diagnostic) =>
    ["configuration", "import", "typecheck"].includes(diagnostic.phase),
  );
  const invalid =
    errors > 0 || (request.warningsAsErrors === true && warnings > 0);
  const report: DefinitionCheckReport = {
    kind: "powerhouse.definition-check",
    formatVersion: 1,
    profile: request.profile,
    status: failed ? "failed" : invalid ? "invalid" : "ok",
    sourceSet: loadResult.sourceSet,
    definitions,
    diagnostics: orderedDiagnostics,
    summary: { errors, warnings },
  };
  const artifactsByEntryOrder = artifacts.sort((left, right) =>
    compareEntries(left, right),
  );
  return { report, artifacts: artifactsByEntryOrder };
}

function reportWithAdditionalDiagnostics(
  report: DefinitionCheckReport,
  additional: readonly DefinitionDiagnosticV1[],
  warningsAsErrors = false,
): DefinitionCheckReport {
  if (report.status === "skipped" || additional.length === 0) return report;
  const diagnostics = sortDefinitionDiagnostics([
    ...report.diagnostics,
    ...additional,
  ]);
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  ).length;
  const warnings = diagnostics.length - errors;
  const failed = diagnostics.some(
    (diagnostic) =>
      ["configuration", "import", "typecheck"].includes(diagnostic.phase) ||
      diagnostic.code === "PH-GQL-PROFILE-VALIDATION-FAILED",
  );
  const invalid = errors > 0 || (warningsAsErrors && warnings > 0);
  return {
    ...report,
    status: failed ? "failed" : invalid ? "invalid" : report.status,
    diagnostics,
    summary: { errors, warnings },
  };
}

function missingSubgraphProfileDiagnostics(
  request: LoadedDefinitionCheckRequest,
  artifacts: readonly NormalizedDefinitionArtifact[],
): readonly DefinitionDiagnosticV1[] {
  return artifacts
    .filter(
      (
        artifact,
      ): artifact is Extract<
        NormalizedDefinitionArtifact,
        { readonly kind: "subgraph" }
      > => artifact.kind === "subgraph",
    )
    .map((artifact) => ({
      code: "PH-GQL-PROFILE-VALIDATOR-MISSING",
      severity: "error",
      phase: "composition",
      source: artifact.source,
      definition: { kind: "subgraph", key: artifact.key },
      path: [],
      message: `The ${request.profile} profile did not run its host-owned subgraph checks.`,
      repair:
        "Run the definition check through a host that supplies the subgraph profile validator.",
    }));
}

export async function checkDefinitions(
  request: LoadedDefinitionCheckRequest,
  options: DefinitionCheckOptions = {},
): Promise<DefinitionCheckReport> {
  const result = normalizeDefinitions(request, options);
  const subgraphs = result.artifacts.filter(
    (
      artifact,
    ): artifact is Extract<
      NormalizedDefinitionArtifact,
      { readonly kind: "subgraph" }
    > => artifact.kind === "subgraph",
  );
  if (subgraphs.length === 0 || result.report.status === "skipped") {
    return result.report;
  }
  if (!options.subgraphProfileValidator) {
    return reportWithAdditionalDiagnostics(
      result.report,
      missingSubgraphProfileDiagnostics(request, result.artifacts),
      request.warningsAsErrors,
    );
  }
  try {
    const diagnostics = await options.subgraphProfileValidator({
      profile: request.profile,
      artifacts: Object.freeze([...subgraphs]),
    });
    return reportWithAdditionalDiagnostics(
      result.report,
      [...diagnostics],
      request.warningsAsErrors,
    );
  } catch {
    return reportWithAdditionalDiagnostics(
      result.report,
      [
        {
          code: "PH-GQL-PROFILE-VALIDATION-FAILED",
          severity: "error",
          phase: "composition",
          ...(subgraphs[0] ? { source: subgraphs[0].source } : {}),
          path: [],
          message: `The ${request.profile} subgraph profile validator did not complete.`,
          repair:
            "Repair the host profile validator and rerun the complete definition check.",
        },
      ],
      request.warningsAsErrors,
    );
  }
}
