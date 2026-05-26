import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { z } from "zod";

import type { OpenPanelEventMapping } from "./types.js";
import rawEvents from "./events.json" with { type: "json" };

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const EventMappingSchema = z
  .object({
    documentType: z.string().min(1),
    actionTypes: z.array(z.string().min(1)).min(1),
    alias: z.string().optional(),
  })
  .strict();

const EventMappingsSchema = z.array(EventMappingSchema).readonly();

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Parses and validates the event mapping table.
 *
 * - Accepts an optional `raw` override so tests can inject crafted or invalid
 *   data without touching the filesystem.
 * - Throws on zod validation failures.
 * - Throws on duplicate `(documentType, actionType)` pairs, both within a
 *   single entry and across entries that share the same `documentType`.
 *
 * @returns The validated mapping array and the O(1) lookup map.
 */
export function loadEvents(raw: unknown = rawEvents): {
  mappings: readonly OpenPanelEventMapping[];
  lookupMap: Map<string, Map<string, OpenPanelEventMapping>>;
} {
  const result = EventMappingsSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid OpenPanel events.json: ${result.error.message}`,
    );
  }

  const mappings = result.data as readonly OpenPanelEventMapping[];
  const lookupMap = new Map<string, Map<string, OpenPanelEventMapping>>();

  for (const mapping of mappings) {
    let inner = lookupMap.get(mapping.documentType);
    if (!inner) {
      inner = new Map<string, OpenPanelEventMapping>();
      lookupMap.set(mapping.documentType, inner);
    }

    for (const actionType of mapping.actionTypes) {
      if (inner.has(actionType)) {
        throw new Error(
          `Duplicate OpenPanel event mapping for ${mapping.documentType}/${actionType}`,
        );
      }
      inner.set(actionType, mapping);
    }
  }

  return { mappings, lookupMap };
}

// ---------------------------------------------------------------------------
// Module-level loaded state (defaults from events.json)
// ---------------------------------------------------------------------------

const { mappings: defaultMappings, lookupMap: defaultLookupMap } =
  loadEvents();

/** Validated mapping array from the bundled events.json. */
export const eventMappings: readonly OpenPanelEventMapping[] = defaultMappings;

/** O(1) lookup map: documentType → actionType → mapping. */
export const eventLookupMap: Map<
  string,
  Map<string, OpenPanelEventMapping>
> = defaultLookupMap;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes a document-type string into a safe event-name segment.
 *
 * - Lowercases the string.
 * - Replaces `/` with `.`.
 * - Strips any character that is not `[a-z0-9._-]`.
 *
 * Examples:
 * - `powerhouse/document-drive` → `powerhouse.document-drive`
 * - `sky/atlas-scope`           → `sky.atlas-scope`
 */
export function normalize(documentType: string): string {
  return documentType
    .toLowerCase()
    .replace(/\//g, ".")
    .replace(/[^a-z0-9._-]/g, "");
}

/**
 * Derives the OpenPanel event name for a given mapping and operation.
 *
 * Returns `mapping.alias` when present; otherwise produces the deterministic
 * form `${normalize(documentType)}.${actionType.toLowerCase()}`.
 */
export function deriveEventName(
  mapping: OpenPanelEventMapping,
  op: OperationWithContext,
): string {
  if (mapping.alias) {
    return mapping.alias;
  }
  return `${normalize(op.context.documentType)}.${op.operation.action.type.toLowerCase()}`;
}

/**
 * Builds the six default properties attached to every OpenPanel event.
 *
 * | Property       | Source                           |
 * |----------------|----------------------------------|
 * | documentType   | op.context.documentType          |
 * | actionType     | op.operation.action.type         |
 * | documentId     | op.context.documentId            |
 * | scope          | op.context.scope                 |
 * | branch         | op.context.branch                |
 * | app            | "connect" (constant)             |
 */
export function buildDefaultProperties(op: OperationWithContext): {
  documentType: string;
  actionType: string;
  documentId: string;
  scope: string;
  branch: string;
  app: string;
} {
  return {
    documentType: op.context.documentType,
    actionType: op.operation.action.type,
    documentId: op.context.documentId,
    scope: op.context.scope,
    branch: op.context.branch,
    app: "connect",
  };
}
