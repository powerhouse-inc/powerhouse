import type {
  DocumentModelGlobalState,
  DocumentModelSpecificationDefinition,
} from "@powerhousedao/shared/document-model";
import {
  childLogger,
  type DocumentModelDefinitionInspection,
  type DocumentModelGraphQLProjection,
  inspectDocumentModelDefinition,
  projectDocumentModelGraphQL,
} from "document-model";
import { createHash } from "node:crypto";
import type { DocumentModelSchemaSource } from "./model-projection.js";
import { storedSchemaSource } from "./stored-projection.js";
import { structuredSchemaSource } from "./structured-projection.js";

/** The part of a document model module its schema is built from. */
export type DocumentModelSource = {
  documentModel: { global: DocumentModelGlobalState };
  definition?: unknown;
};

const logger = childLogger(["reactor-api", "document-model-schema"]);

const logged = new Set<string>();

function warnOnce(documentType: string, reason: string, detail: unknown) {
  const key = `${documentType}\n${reason}`;
  if (logged.has(key)) return;
  logged.add(key);
  logger.warn(
    "Serving document model @documentType from its stored model: its definition is @reason: @detail",
    documentType,
    reason,
    detail,
  );
}

type Projected =
  | {
      readonly projection: DocumentModelGraphQLProjection;
      /** Sources by the model's stored name, which namespaces the schema. */
      readonly sources: Map<unknown, DocumentModelSchemaSource>;
    }
  | { readonly error: unknown };

// Inspection returns the same specification object for the same definition
// object, so each definition is projected once.
const projected = new WeakMap<
  DocumentModelSpecificationDefinition,
  Projected
>();

function project(
  inspection: Extract<
    DocumentModelDefinitionInspection,
    { kind: "structured" }
  >,
): Projected {
  let entry = projected.get(inspection.specification);
  if (entry === undefined) {
    try {
      entry = {
        projection: projectDocumentModelGraphQL(
          inspection.definition,
          inspection.specification,
        ),
        sources: new Map(),
      };
    } catch (error) {
      entry = { error };
    }
    projected.set(inspection.specification, entry);
  }
  return entry;
}

const snapshotDigests = new WeakMap<object, string>();

/**
 * The cache-key part a model's definition adds: a digest of the inspected
 * snapshot when the schema is built from it, else `null`, so a model served
 * from its stored SDL keeps main's key. Inspection is memoized per definition
 * object, so this runs once per loaded definition.
 */
export function structuredDefinitionDigest(
  model: DocumentModelSource,
): string | null {
  let inspection: DocumentModelDefinitionInspection;
  try {
    inspection = inspectDocumentModelDefinition(model);
  } catch {
    return null;
  }
  if (inspection.kind !== "structured") return null;
  let digest = snapshotDigests.get(inspection.definition);
  if (digest === undefined) {
    digest = createHash("sha256")
      .update(JSON.stringify(inspection.definition))
      .digest("base64");
    snapshotDigests.set(inspection.definition, digest);
  }
  return digest;
}

/**
 * The one place a host selects how a document model's schema is built: from
 * its structured definition when it carries a valid, matching one, else from
 * its stored SDL.
 */
export function documentModelSchemaSource(
  model: DocumentModelSource,
): DocumentModelSchemaSource {
  const { global } = model.documentModel;
  let inspection: DocumentModelDefinitionInspection;
  try {
    inspection = inspectDocumentModelDefinition(model);
  } catch (error) {
    warnOnce(global.id, "unreadable", error);
    return storedSchemaSource(global);
  }
  if (inspection.kind === "stored") {
    if (inspection.reason === "invalid" || inspection.reason === "mismatch") {
      warnOnce(global.id, inspection.reason, inspection.diagnostics);
    }
    return storedSchemaSource(global);
  }
  const entry = project(inspection);
  if ("error" in entry) {
    warnOnce(global.id, "unreadable", entry.error);
    return storedSchemaSource(global);
  }
  let source = entry.sources.get(global.name);
  if (source === undefined) {
    source = structuredSchemaSource(entry.projection, global);
    entry.sources.set(global.name, source);
  }
  return source;
}
