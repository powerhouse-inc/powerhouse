import type {
  DefinitionDiagnostic,
  DefinitionPath,
  DefinitionRef,
  DefinitionSource,
} from "@powerhousedao/shared/document-model";
import { snapshotArray, snapshotRecord } from "../data-properties.js";
import {
  createDiagnostic,
  type DefinitionDiagnosticCode,
  DEFINITION_DIAGNOSTIC_CODES,
} from "../diagnostics.js";

export function describeThrown(error: unknown): string {
  if (error === null) return "null";
  try {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }
  } catch {
    // A revoked Proxy or a throwing getter makes these reads throw.
  }
  return typeof error;
}

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

const DEFINITION_KINDS = [
  "document-model",
  "subgraph",
  "scalar",
  "package",
] as const;

function definitionRef(value: unknown): DefinitionRef | undefined {
  const snapshot = snapshotRecord(value, undefined, []);
  if (!snapshot.ok) return undefined;
  const { kind, key, version } = snapshot.value;
  if (
    typeof key !== "string" ||
    key === "" ||
    !DEFINITION_KINDS.includes(kind as (typeof DEFINITION_KINDS)[number])
  ) {
    return undefined;
  }
  return {
    kind: kind as DefinitionRef["kind"],
    key,
    ...(typeof version === "number" && { version }),
  };
}

/**
 * Rebuilds the diagnostics a structured compilation failure or a compiled
 * subgraph class carries, or returns `undefined` when it holds no valid list.
 * Under a Vite adapter the value can come from a second copy of this package,
 * so `instanceof` cannot recognise it.
 */
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
    const path = snapshotArray(entry.value.path, []);
    if (
      typeof code !== "string" ||
      !Object.prototype.hasOwnProperty.call(
        DEFINITION_DIAGNOSTIC_CODES,
        code,
      ) ||
      typeof message !== "string" ||
      typeof repair !== "string" ||
      !path.ok ||
      !path.value.every(
        (segment) =>
          typeof segment === "string" ||
          (typeof segment === "number" && Number.isSafeInteger(segment)),
      ) ||
      (expected !== undefined && typeof expected !== "string") ||
      (received !== undefined && typeof received !== "string")
    ) {
      return undefined;
    }
    const definition = definitionRef(entry.value.definition);
    rebuilt.push(
      createDiagnostic({
        code: code as DefinitionDiagnosticCode,
        source,
        ...(definition !== undefined && { definition }),
        path: path.value as DefinitionPath,
        message,
        ...(expected !== undefined && { expected }),
        ...(received !== undefined && { received }),
        repair,
      }),
    );
  }
  return rebuilt;
}
