import type {
  DefinitionDiagnostic,
  DefinitionPath,
  DefinitionRef,
  DefinitionRelatedLocation,
  DefinitionSource,
} from "@powerhousedao/shared/document-model";
import { snapshotArray, snapshotRecord } from "../kernel/data-properties.js";
import {
  type ToolingDiagnosticCode,
  toolingDiagnostics,
} from "./diagnostic-codes.js";

export function describeThrown(error: unknown): string {
  if (error === null) return "null";
  try {
    if (error instanceof Error) return `${error.name}: ${error.message}`;
  } catch {
    // A revoked Proxy or a throwing getter makes these reads throw.
  }
  return typeof error;
}

/** Reads an own data property without running a getter or a Proxy trap twice. */
export function readProperty(
  value: object,
  key: string,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      return { ok: false };
    }
    return { ok: true, value: descriptor.value as unknown };
  } catch {
    return { ok: false };
  }
}

const DEFINITION_KINDS: readonly unknown[] = [
  "document-model",
  "subgraph",
  "scalar",
  "package",
];

function definitionRef(value: unknown): DefinitionRef | undefined {
  const snapshot = snapshotRecord(value, undefined, []);
  if (!snapshot.ok) return undefined;
  const { kind, key, version } = snapshot.value;
  if (
    typeof key !== "string" ||
    key === "" ||
    !DEFINITION_KINDS.includes(kind)
  ) {
    return undefined;
  }
  return {
    kind: kind as DefinitionRef["kind"],
    key,
    ...(typeof version === "number" && { version }),
  };
}

function isPathSegment(segment: unknown): boolean {
  return (
    typeof segment === "string" ||
    (typeof segment === "number" && Number.isSafeInteger(segment))
  );
}

function definitionPath(value: unknown): DefinitionPath | undefined {
  const path = snapshotArray(value, []);
  return path.ok && path.value.every(isPathSegment)
    ? (path.value as DefinitionPath)
    : undefined;
}

function relatedSource(value: unknown): DefinitionSource | undefined | null {
  if (value === undefined) return undefined;
  const snapshot = snapshotRecord(value, undefined, []);
  if (!snapshot.ok) return null;
  const { specifier, exportPath } = snapshot.value;
  if (typeof specifier !== "string" || !specifier.startsWith("./")) {
    return null;
  }
  const source = { specifier: specifier as `./${string}` };
  if (exportPath === undefined) return source;
  const path = snapshotArray(exportPath, []);
  if (!path.ok || !path.value.every((key) => typeof key === "string")) {
    return null;
  }
  return { ...source, exportPath: path.value as string[] };
}

function relatedLocations(
  value: unknown,
): readonly DefinitionRelatedLocation[] | undefined | null {
  if (value === undefined) return undefined;
  const list = snapshotArray(value, []);
  if (!list.ok) return null;
  const locations: DefinitionRelatedLocation[] = [];
  for (const candidate of list.value) {
    const entry = snapshotRecord(candidate, undefined, []);
    if (!entry.ok) return null;
    const path = definitionPath(entry.value.path);
    const source = relatedSource(entry.value.source);
    const { message } = entry.value;
    if (path === undefined || source === null || typeof message !== "string") {
      return null;
    }
    locations.push({
      ...(source !== undefined && { source }),
      path,
      message,
    });
  }
  return locations;
}

export function structuredDiagnostics(
  value: unknown,
  source: DefinitionSource,
): readonly DefinitionDiagnostic[] | undefined {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return undefined;
  }
  const list = readProperty(value, "diagnostics");
  if (!list.ok) return undefined;
  const snapshot = snapshotArray(list.value, []);
  if (!snapshot.ok || snapshot.value.length === 0) return undefined;

  const rebuilt: DefinitionDiagnostic[] = [];
  for (const candidate of snapshot.value) {
    const entry = snapshotRecord(candidate, undefined, []);
    if (!entry.ok) return undefined;
    const { code, message, repair, expected, received } = entry.value;
    const path = definitionPath(entry.value.path);
    const related = relatedLocations(entry.value.related);
    if (
      typeof code !== "string" ||
      !Object.hasOwn(toolingDiagnostics.codes, code) ||
      typeof message !== "string" ||
      typeof repair !== "string" ||
      path === undefined ||
      related === null ||
      (expected !== undefined && typeof expected !== "string") ||
      (received !== undefined && typeof received !== "string")
    ) {
      return undefined;
    }
    const definition = definitionRef(entry.value.definition);
    rebuilt.push(
      toolingDiagnostics.create({
        code: code as ToolingDiagnosticCode,
        source,
        ...(definition !== undefined && { definition }),
        path,
        message,
        ...(expected !== undefined && { expected }),
        ...(received !== undefined && { received }),
        repair,
        ...(related !== undefined && { related }),
      }),
    );
  }
  return rebuilt;
}
