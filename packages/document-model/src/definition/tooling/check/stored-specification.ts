import type {
  DefinitionDiagnostic,
  DefinitionPath,
} from "@powerhousedao/shared/document-model";
import {
  rejectionReceived,
  snapshotArray,
  snapshotRecord,
} from "../../kernel/data-properties.js";
import { describeReceived } from "../../kernel/diagnostics.js";
import type { NormalizedDocumentModelArtifact } from "../adapters/types.js";
import { checkDiagnostics } from "./diagnostic-codes.js";
import { documentModelRef } from "../report/served-specification.js";

type Scope = "global" | "local";

/** A stored SDL string, where it sits in the source, and what it describes. */
export type StoredSchemaSegment = {
  readonly path: DefinitionPath;
  readonly schema: string;
  readonly of:
    | { readonly scope: Scope }
    | { readonly module: number; readonly operation: number };
};

/** The stored strings of the specification an artifact serves. */
export type ServedStoredSpecification = {
  readonly path: DefinitionPath;
  readonly initialValues: Readonly<Record<Scope, string>>;
  /** In the order the stored model lists them: global, local, then operations. */
  readonly segments: readonly StoredSchemaSegment[];
};

type StoredHistory = {
  readonly path: DefinitionPath;
  readonly versions: readonly number[];
  /** Undefined when the stored history has no specification for the served version. */
  readonly served: ServedStoredSpecification | undefined;
};

export type StoredModelRead =
  | ({ readonly ok: true } & StoredHistory)
  | { readonly ok: false; readonly diagnostic: DefinitionDiagnostic };

type Read<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly path: DefinitionPath;
      readonly expected: string;
      readonly received: string;
    };

function record(
  value: unknown,
  path: DefinitionPath,
): Read<{ readonly [key: string]: unknown }> {
  const snapshot = snapshotRecord(value, undefined, path);
  return snapshot.ok
    ? snapshot
    : {
        ok: false,
        path: snapshot.path,
        expected: "a plain record",
        received: rejectionReceived(snapshot),
      };
}

function array(value: unknown, path: DefinitionPath): Read<readonly unknown[]> {
  const snapshot = snapshotArray(value, path);
  return snapshot.ok
    ? snapshot
    : {
        ok: false,
        path: snapshot.path,
        expected: "an array",
        received: rejectionReceived(snapshot),
      };
}

function text(value: unknown, path: DefinitionPath): Read<string> {
  return typeof value === "string"
    ? { ok: true, value }
    : {
        ok: false,
        path,
        expected: "a string",
        received: describeReceived(value),
      };
}

function readServedStoredSpecification(
  value: unknown,
  path: DefinitionPath,
): Read<ServedStoredSpecification> {
  const specification = record(value, path);
  if (!specification.ok) return specification;
  const state = record(specification.value.state, [...path, "state"]);
  if (!state.ok) return state;
  const initialValues: Partial<Record<Scope, string>> = {};
  const segments: StoredSchemaSegment[] = [];
  for (const scope of ["global", "local"] as const) {
    const at = [...path, "state", scope];
    const stored = record(state.value[scope], at);
    if (!stored.ok) return stored;
    const schema = text(stored.value.schema, [...at, "schema"]);
    if (!schema.ok) return schema;
    const initialValue = text(stored.value.initialValue, [
      ...at,
      "initialValue",
    ]);
    if (!initialValue.ok) return initialValue;
    initialValues[scope] = initialValue.value;
    segments.push({
      path: [...at, "schema"],
      schema: schema.value,
      of: { scope },
    });
  }
  const modules = array(specification.value.modules, [...path, "modules"]);
  if (!modules.ok) return modules;
  for (const [moduleIndex, entry] of modules.value.entries()) {
    const at = [...path, "modules", moduleIndex];
    const module = record(entry, at);
    if (!module.ok) return module;
    const operations = array(module.value.operations, [...at, "operations"]);
    if (!operations.ok) return operations;
    for (const [operationIndex, member] of operations.value.entries()) {
      const operationPath = [...at, "operations", operationIndex];
      const operation = record(member, operationPath);
      if (!operation.ok) return operation;
      if (operation.value.schema === null) continue;
      const schema = text(operation.value.schema, [...operationPath, "schema"]);
      if (!schema.ok) return schema;
      segments.push({
        path: [...operationPath, "schema"],
        schema: schema.value,
        of: { module: moduleIndex, operation: operationIndex },
      });
    }
  }
  return {
    ok: true,
    value: {
      path,
      initialValues: initialValues as Record<Scope, string>,
      segments,
    },
  };
}

function storedHistory(
  artifact: NormalizedDocumentModelArtifact,
): Read<StoredHistory> {
  const documentModel = record(artifact.documentModel, ["documentModel"]);
  const global = documentModel.ok
    ? record(documentModel.value.global, ["documentModel", "global"])
    : documentModel;
  if (!global.ok) return global;
  const path = ["documentModel", "global", "specifications"];
  const specifications = array(global.value.specifications, path);
  if (!specifications.ok) return specifications;
  const versions: number[] = [];
  let served: unknown;
  let servedIndex = -1;
  for (const [index, entry] of specifications.value.entries()) {
    const specification = record(entry, [...path, index]);
    if (!specification.ok) return specification;
    const { version } = specification.value;
    if (typeof version !== "number") {
      return {
        ok: false,
        path: [...path, index, "version"],
        expected: "a version number",
        received: describeReceived(version),
      };
    }
    versions.push(version);
    if (version === artifact.version && servedIndex === -1) {
      served = entry;
      servedIndex = index;
    }
  }
  if (servedIndex === -1) {
    return { ok: true, value: { path, versions, served: undefined } };
  }
  const specification = readServedStoredSpecification(served, [
    ...path,
    servedIndex,
  ]);
  return specification.ok
    ? { ok: true, value: { path, versions, served: specification.value } }
    : specification;
}

/**
 * Reads the stored model an artifact serves without trusting its shape: a
 * module assembled by hand can carry anything there. Every check that reads
 * stored strings goes through this, so each reports one malformed member the
 * same way and the report keeps it once.
 */
export function readStoredModel(
  artifact: NormalizedDocumentModelArtifact,
): StoredModelRead {
  const read = storedHistory(artifact);
  if (read.ok) return { ok: true, ...read.value };
  return {
    ok: false,
    diagnostic: checkDiagnostics.create({
      code: "PH-DM-DECLARATION-INVALID",
      source: artifact.source,
      definition: documentModelRef(artifact),
      path: read.path,
      message:
        "The stored document model this source serves is malformed, so hosts and codegen cannot read it.",
      expected: read.expected,
      received: read.received,
      repair:
        "Export the module materialize returned, or save the model again from the document model editor; the stored model is not edited by hand.",
    }),
  };
}
