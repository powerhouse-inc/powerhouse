import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { z } from "zod";

import type { OpenPanelEventMapping } from "./types.js";
import rawEvents from "./events.json" with { type: "json" };

const EventMappingSchema = z
  .object({
    documentType: z.string().min(1),
    actionTypes: z.array(z.string().min(1)).min(1),
    alias: z.string().optional(),
  })
  .strict();

const EventMappingsSchema = z.array(EventMappingSchema).readonly();

/**
 * Parses and validates the event mapping table, returning the validated array
 * and an O(1) lookup map. Accepts a `raw` override for tests. Throws on zod
 * failures and on duplicate `(documentType, actionType)` pairs.
 */
export function loadEvents(raw: unknown = rawEvents): {
  mappings: readonly OpenPanelEventMapping[];
  lookupMap: Map<string, Map<string, OpenPanelEventMapping>>;
} {
  const result = EventMappingsSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid OpenPanel events.json: ${result.error.message}`);
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

const { mappings: defaultMappings, lookupMap: defaultLookupMap } = loadEvents();

/** Validated mapping array from the bundled events.json. */
export const eventMappings: readonly OpenPanelEventMapping[] = defaultMappings;

/** O(1) lookup map: documentType → actionType → mapping. */
export const eventLookupMap: Map<
  string,
  Map<string, OpenPanelEventMapping>
> = defaultLookupMap;

/**
 * Normalizes a document type into a safe event-name segment: lowercased, `/`
 * replaced with `.`, and any character outside `[a-z0-9._-]` stripped.
 * e.g. `powerhouse/document-drive` → `powerhouse.document-drive`.
 */
export function normalize(documentType: string): string {
  return documentType
    .toLowerCase()
    .replace(/\//g, ".")
    .replace(/[^a-z0-9._-]/g, "");
}

/**
 * Derives the OpenPanel event name: `mapping.alias` when present, otherwise
 * `${normalize(documentType)}.${actionType.toLowerCase()}`.
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

/** Builds the default properties attached to every OpenPanel event. */
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
