import type {
  DefinitionPath,
  DefinitionSource,
  DocumentModelDefinition,
  DocumentModelPHState,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import { definitionModuleMismatch } from "../../compiler/module-definition.js";
import { checkDocumentModelDefinitionShape } from "../../compiler/wire-shape.js";
import {
  rejectionReceived,
  snapshotArray,
  snapshotRecord,
} from "../../kernel/data-properties.js";
import { DefinitionDiagnosticCollector } from "../../kernel/diagnostic-collector.js";
import { describeReceived } from "../../kernel/diagnostics.js";
import { canonicalDigest, canonicalJson } from "../../kernel/primitives.js";
import {
  type ToolingDiagnosticCode,
  toolingDiagnostics,
} from "../diagnostic-codes.js";
import type {
  NormalizedDocumentModelArtifact,
  NormalizedDocumentModelResult,
} from "./types.js";

type Collector = DefinitionDiagnosticCollector<ToolingDiagnosticCode>;

const MODULE_KEYS =
  "version, reducer, actions, utils, documentModel, definition";
const REPAIR =
  "Export the module materialize returned, or family.at(version), without replacing its members.";

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

function invalid(
  collector: Collector,
  path: DefinitionPath,
  message: string,
  expected: string,
  received: string,
  repair = REPAIR,
): undefined {
  collector.add({
    code: "PH-DM-DECLARATION-INVALID",
    path,
    message,
    expected,
    received,
    repair,
  });
  return undefined;
}

function storedDocumentType(
  collector: Collector,
  value: unknown,
  path: DefinitionPath,
): string | undefined {
  const documentModel = snapshotRecord(value, undefined, path);
  const global = documentModel.ok
    ? snapshotRecord(documentModel.value.global, undefined, [...path, "global"])
    : documentModel;
  if (!global.ok) {
    return invalid(
      collector,
      global.path,
      `A module keeps its stored model in documentModel.global as plain data, and it cannot be read (${global.reason}).`,
      "documentModel.global as a plain record of data properties",
      rejectionReceived(global),
    );
  }
  const id = global.value.id;
  if (typeof id !== "string" || id === "") {
    return invalid(
      collector,
      [...path, "global", "id"],
      "A module has a stored model ID.",
      "a nonempty document type",
      typeof id === "string" ? '""' : describeReceived(id),
      "Declare id in defineDocumentModel; the stored model ID is the document type every consumer registers.",
    );
  }
  return id;
}

function artifact(
  collector: Collector,
  value: unknown,
  source: DefinitionSource,
  path: DefinitionPath,
): NormalizedDocumentModelArtifact | undefined {
  const snapshot = snapshotRecord(value, undefined, path);
  if (!snapshot.ok) {
    return invalid(
      collector,
      snapshot.path,
      `This export is not a document-model module (${snapshot.reason}).`,
      MODULE_KEYS,
      rejectionReceived(snapshot),
    );
  }
  const module = snapshot.value;
  let usable = true;
  if (typeof module.reducer !== "function") {
    usable = false;
    invalid(
      collector,
      [...path, "reducer"],
      "A module has a callable reducer.",
      "a reducer function",
      describeReceived(module.reducer),
    );
  }
  const version = module.version;
  if (
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version <= 0
  ) {
    usable = false;
    invalid(
      collector,
      [...path, "version"],
      "A code-first module declares its registry version as a positive safe integer.",
      "a positive safe integer",
      typeof version === "number" ? String(version) : describeReceived(version),
    );
  }
  const documentType = storedDocumentType(collector, module.documentModel, [
    ...path,
    "documentModel",
  ]);
  if (module.definition === undefined) {
    return invalid(
      collector,
      [...path, "definition"],
      "This module carries no structured definition, so it was not made by materialize.",
      "the definition materialize attaches",
      "undefined",
      "Export the module materialize returned.",
    );
  }
  const shape = checkDocumentModelDefinitionShape(module.definition, [
    ...path,
    "definition",
  ]);
  collector.merge(shape);
  if (
    !usable ||
    documentType === undefined ||
    shape.length > 0 ||
    typeof version !== "number"
  ) {
    return undefined;
  }
  const definition = module.definition as DocumentModelDefinition;

  const mismatch = definitionModuleMismatch(
    definition,
    { documentType, version },
    [...path, "definition"],
  );
  if (mismatch !== undefined) {
    collector.add(mismatch);
    return undefined;
  }
  return {
    kind: "powerhouse.document-model-artifact",
    source,
    documentType,
    version,
    definition,
    digest: canonicalDigest(definition),
    documentModel: module.documentModel as DocumentModelPHState,
  };
}

function familyManifest(
  collector: Collector,
  value: unknown,
  artifacts: readonly NormalizedDocumentModelArtifact[],
  path: DefinitionPath,
): UpgradeManifest<readonly number[]> | null {
  const snapshot = snapshotRecord(value, undefined, path);
  const manifest = snapshot.ok ? snapshot.value : undefined;
  const versions = artifacts.map((entry) => entry.version);
  const supported = manifest?.supportedVersions;
  const declared =
    Array.isArray(supported) && supported.every(Number.isSafeInteger)
      ? canonicalJson(supported)
      : describeReceived(supported);
  if (
    manifest === undefined ||
    declared !== canonicalJson(versions) ||
    manifest.latestVersion !== versions.at(-1)
  ) {
    invalid(
      collector,
      snapshot.ok ? path : snapshot.path,
      "A family's upgrade manifest covers exactly the versions its modules serve.",
      canonicalJson(versions),
      snapshot.ok ? declared : rejectionReceived(snapshot),
      "Export the family materialize returned, so its manifest and modules stay one declaration.",
    );
    return null;
  }
  const documentTypes = new Set(artifacts.map((entry) => entry.documentType));
  if (
    documentTypes.size !== 1 ||
    !documentTypes.has(manifest.documentType as string)
  ) {
    invalid(
      collector,
      [...path, "documentType"],
      "A family's upgrade manifest and its modules name one document type.",
      [...documentTypes].join(", "),
      String(manifest.documentType),
      "Compose one family per document type.",
    );
    return null;
  }
  return value as UpgradeManifest<readonly number[]>;
}

/**
 * @experimental Normalizes one materialized code-first module, or a family
 * and its versions in order. A family reports every malformed member: a
 * valid sibling never makes a broken one pass.
 */
export function adaptCodeFirstDocumentModelSource(
  value: unknown,
  source: DefinitionSource,
): NormalizedDocumentModelResult {
  const collector: Collector = new DefinitionDiagnosticCollector(
    toolingDiagnostics,
  );
  const family = snapshotRecord(value, undefined, []);
  const modules =
    family.ok && typeof family.value.at === "function"
      ? snapshotArray(family.value.modules, ["modules"])
      : undefined;
  if (family.ok && modules?.ok === true) {
    const artifacts = modules.value.flatMap((module, index) => {
      const entry = artifact(
        collector,
        module,
        sourceOf(source, ["modules", String(index)]),
        ["modules", index],
      );
      return entry === undefined ? [] : [entry];
    });
    const manifest =
      artifacts.length === modules.value.length
        ? familyManifest(collector, family.value.upgradeManifest, artifacts, [
            "upgradeManifest",
          ])
        : null;
    return {
      artifacts,
      upgradeManifest: manifest,
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
