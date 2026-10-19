import { createHash } from "node:crypto";
import type { WorkflowStepDef } from "./types.js";

// JSON with object keys sorted at every depth, so key order never changes a hash.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value) ?? null);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, sortKeys(record[key])]),
  );
}

export function hashOf(...parts: string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part).update("\u0000");
  return hash.digest("hex").slice(0, 16);
}

// What a step runs from: its block, config, connection and dynamic-prop
// schemas. Field modes are editor-only.
export function stepConfigHash(step: WorkflowStepDef): string {
  const schemas = (step.propertySettings ?? [])
    .filter(
      (setting) => setting.schema !== null && setting.schema !== undefined,
    )
    .map((setting) => ({ prop: setting.prop, schema: setting.schema }));
  return hashOf(
    step.pieceName,
    step.pieceVersion,
    step.actionName,
    canonicalJson({
      config: step.config ?? {},
      connectionId: step.connectionId ?? null,
      propertySettings: schemas,
      // Only when set, so a step without one keeps its hash.
      ...(step.reactorConnectionId
        ? { reactorConnectionId: step.reactorConnectionId }
        : {}),
    }),
  );
}
