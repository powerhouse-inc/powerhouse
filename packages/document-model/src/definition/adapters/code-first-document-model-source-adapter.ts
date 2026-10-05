import type {
  DefinitionPath,
  DefinitionSource,
  DocumentModelDefinition,
  DocumentModelPHState,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import { snapshotArray, snapshotRecord } from "../data-properties.js";
import { DefinitionDiagnosticCollector } from "../diagnostics.js";
import { compilationReportOf } from "../materialize.js";
import { canonicalDigest, canonicalJson } from "../primitives.js";
import { checkDocumentModelDefinitionShape } from "../wire-shape.js";
import { identityVectorsOf } from "./identity-vectors.js";
import type {
  NormalizedDocumentModelArtifact,
  NormalizedDocumentModelResult,
} from "./types.js";

/**
 * Normalizes a finalized code-first module or family into the shared
 * structured shape, without reparsing any SDL.
 *
 * A code-first module already carries `definition`, so this adapter is mostly
 * a validating projection. It never re-derives a name or an ID the compiler
 * already derived — if it had to, that would be a signal the compiler should
 * have exposed the value. What it does own is the single answer to "is this a
 * usable code-first model?", and reporting a malformed export with its source
 * path instead of throwing, so one bad export cannot lose the reports of the
 * roots beside it.
 */

const MODULE_KEYS = [
  "version",
  "reducer",
  "actions",
  "utils",
  "documentModel",
  "definition",
] as const;

/** The shape a finalized module has to present before anything else is read. */
type InspectedModule = {
  readonly definition: DocumentModelDefinition;
  readonly documentModel: DocumentModelPHState;
  readonly version: number;
  readonly storedId: string;
};

function sourceOf(
  source: DefinitionSource,
  exportPath: readonly string[],
): DefinitionSource {
  const path = [...(source.exportPath ?? []), ...exportPath];
  return {
    specifier: source.specifier,
    ...(path.length > 0 && { exportPath: path }),
  };
}

function inspect(
  collector: DefinitionDiagnosticCollector,
  value: unknown,
  path: DefinitionPath,
): InspectedModule | undefined {
  const snapshot = snapshotRecord(value, undefined, path);
  if (!snapshot.ok) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: snapshot.path,
      message: `This export is not a document-model module (${snapshot.reason}).`,
      expected: MODULE_KEYS.join(", "),
      received: value === null ? "null" : typeof value,
      repair:
        "Export the module returned by context.finalize() or family.at(version).",
    });
    return undefined;
  }
  const module = snapshot.value;

  if (typeof module.reducer !== "function") {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: [...path, "reducer"],
      message: "A usable document-model module has a callable reducer.",
      expected: "a reducer function",
      received: typeof module.reducer,
      repair:
        "Export the module returned by context.finalize(); a stored specification alone is not a module.",
    });
  }

  const version = module.version;
  if (
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version <= 0
  ) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: [...path, "version"],
      message:
        "A code-first module declares its registry version as a positive safe integer.",
      expected: "a positive safe integer",
      received: typeof version === "number" ? String(version) : typeof version,
      repair:
        "Declare version in defineDocumentModel and finalize through a version family.",
    });
  }

  const documentModel = snapshotRecord(module.documentModel, undefined, [
    ...path,
    "documentModel",
  ]);
  const global = documentModel.ok
    ? snapshotRecord(documentModel.value.global, undefined, [
        ...path,
        "documentModel",
        "global",
      ])
    : undefined;
  const storedId = global?.ok === true ? global.value.id : undefined;
  if (typeof storedId !== "string" || storedId === "") {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: [...path, "documentModel", "global", "id"],
      message: "A usable document-model module has a stored model ID.",
      expected: "a nonempty document type",
      received: typeof storedId === "string" ? '""' : typeof storedId,
      repair:
        "Declare id in defineDocumentModel; the stored model ID is the document type every consumer registers.",
    });
  }

  const valid = checkDocumentModelDefinitionShape(
    collector,
    module.definition,
    [...path, "definition"],
  );
  if (
    !valid ||
    typeof version !== "number" ||
    typeof storedId !== "string" ||
    storedId === "" ||
    typeof module.reducer !== "function"
  ) {
    return undefined;
  }
  return {
    definition: module.definition as DocumentModelDefinition,
    documentModel: module.documentModel as DocumentModelPHState,
    version,
    storedId,
  };
}

function artifact(
  collector: DefinitionDiagnosticCollector,
  value: unknown,
  source: DefinitionSource,
  path: DefinitionPath,
): NormalizedDocumentModelArtifact | undefined {
  const inspected = inspect(collector, value, path);
  if (inspected === undefined) return undefined;
  const { definition, version, storedId } = inspected;
  // Compilation can raise a report-only diagnostic — a reused stored ID, for
  // one — which by design does not fail a declaration. Carrying it into the
  // adapter's report is what keeps it from being silently dropped.
  const compiled = compilationReportOf(value);
  if (compiled !== undefined) collector.merge(compiled.diagnostics);

  // The module, its stored model ID, its declared version, and its complete
  // specification history have to describe one model. A definition that
  // passes the wire shape can still belong to a different module.
  if (definition.model.documentType !== storedId) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: [...path, "definition", "model", "documentType"],
      message:
        "The structured definition and the stored model describe different document types.",
      expected: storedId,
      received: definition.model.documentType,
      repair:
        "Materialize the module and its definition from the same declaration.",
    });
    return undefined;
  }
  const specification = definition.specifications.find(
    (candidate) => candidate.version === version,
  );
  if (specification === undefined) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: [...path, "definition", "specifications"],
      message: `The specification history carries no version ${version}, which is the version this module serves.`,
      expected: `a specification for version ${version}`,
      received: definition.specifications
        .map((candidate) => String(candidate.version))
        .join(", "),
      repair:
        "Compose the version through defineDocumentModelFamily so every module carries the complete history.",
    });
    return undefined;
  }

  return {
    kind: "powerhouse.document-model-artifact",
    source,
    documentType: storedId,
    version,
    definition,
    digest: canonicalDigest(definition),
    documentModel: inspected.documentModel,
    identity: identityVectorsOf(specification, storedId),
  };
}

function upgradeManifestOf(
  collector: DefinitionDiagnosticCollector,
  value: unknown,
  artifacts: readonly NormalizedDocumentModelArtifact[],
  path: DefinitionPath,
): UpgradeManifest<readonly number[]> | null {
  const snapshot = snapshotRecord(value, undefined, path);
  const manifest = snapshot.ok ? snapshot.value : undefined;
  const supported =
    manifest === undefined ? undefined : manifest.supportedVersions;
  const versions = artifacts.map((entry) => entry.version);
  if (
    manifest === undefined ||
    typeof manifest.documentType !== "string" ||
    !Array.isArray(supported) ||
    canonicalJson(supported) !== canonicalJson(versions) ||
    manifest.latestVersion !== versions.at(-1)
  ) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path,
      message:
        "A family's upgrade manifest must cover exactly the versions its modules serve.",
      expected: canonicalJson(versions),
      received:
        manifest === undefined
          ? typeof value
          : canonicalJson((supported ?? null) as never),
      repair:
        "Publish the manifest defineDocumentModelFamily returned, beside the modules of the same family.",
    });
    return null;
  }
  const documentTypes = new Set(artifacts.map((entry) => entry.documentType));
  if (!documentTypes.has(manifest.documentType) || documentTypes.size !== 1) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: [...path, "documentType"],
      message:
        "A family's upgrade manifest and its modules must name one document type.",
      expected: [...documentTypes].join(", "),
      received: manifest.documentType,
      repair: "Compose one family per document type.",
    });
    return null;
  }
  return value as UpgradeManifest<readonly number[]>;
}

/**
 * Normalizes one finalized module, or a family and its ordered versions.
 * A family reports every malformed member: a valid sibling never makes a
 * broken one pass.
 */
export function adaptCodeFirstDocumentModelSource(
  value: unknown,
  source: DefinitionSource,
): NormalizedDocumentModelResult {
  const collector = new DefinitionDiagnosticCollector();
  const family = snapshotRecord(value, undefined, []);
  const modules =
    family.ok && family.value.modules !== undefined
      ? snapshotArray(family.value.modules, ["modules"])
      : undefined;

  if (
    modules !== undefined &&
    modules.ok &&
    typeof (family.ok ? family.value.at : undefined) === "function"
  ) {
    const artifacts = modules.value.flatMap((module, index) => {
      const entry = artifact(
        collector,
        module,
        sourceOf(source, ["modules", String(index)]),
        ["modules", index],
      );
      return entry === undefined ? [] : [entry];
    });
    const manifest = upgradeManifestOf(
      collector,
      family.ok ? family.value.upgradeManifest : undefined,
      artifacts,
      ["upgradeManifest"],
    );
    return {
      artifacts,
      upgradeManifest:
        artifacts.length === modules.value.length ? manifest : null,
      diagnostics: collector.diagnostics,
    };
  }

  const single = artifact(collector, value, source, []);
  return {
    artifacts: single === undefined ? [] : [single],
    upgradeManifest: null,
    diagnostics: collector.diagnostics,
  };
}
