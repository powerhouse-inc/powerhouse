// Pure config parsing/matching for the document trigger kinds. Each config
// field is a string or list; an omitted field matches every value.

// Declared by the reactor piece, fired by this host: the processor sees every
// operation, so matching one against a filter never leaves the process.
import {
  DOCUMENT_CREATED_BLOCK,
  DOCUMENT_DELETED_BLOCK,
  DOCUMENT_EVENT_BLOCK,
} from "./reactor-piece.js";

export { DOCUMENT_CREATED_BLOCK, DOCUMENT_DELETED_BLOCK, DOCUMENT_EVENT_BLOCK };

export type TriggerKind =
  | "document-event"
  | "document-created"
  | "document-deleted";

export const TRIGGER_KIND_BY_BLOCK: Record<string, TriggerKind> = {
  [DOCUMENT_EVENT_BLOCK]: "document-event",
  [DOCUMENT_CREATED_BLOCK]: "document-created",
  [DOCUMENT_DELETED_BLOCK]: "document-deleted",
};

export interface DocumentEventFilter {
  documentType?: string[];
  documentId?: string[];
  actionType?: string[];
}

// Lifecycle triggers match the document-scope CREATE_DOCUMENT /
// DELETE_DOCUMENT operations, and fall back to the drive's ADD_FILE /
// DELETE_NODE when no document-scope operation reaches the processor.
export interface LifecycleFilter {
  documentType?: string[];
  // A document that lives outside every drive has no drive id, so a set
  // driveId narrows the trigger to drive members.
  driveId?: string[];
}

// A created/deleted document is announced by a document-scope operation on
// the document itself: CREATE_DOCUMENT carries the type and name, and
// DELETE_DOCUMENT is the only signal that a document is really gone.
export function lifecycleKindForDocumentAction(
  actionType: string,
): TriggerKind | undefined {
  if (actionType === "CREATE_DOCUMENT") return "document-created";
  if (actionType === "DELETE_DOCUMENT") return "document-deleted";
  return undefined;
}

// The drive's own view of the same events. ADD_FILE always accompanies a
// CREATE_DOCUMENT, so this is a fallback; DELETE_NODE is on its own only
// unlinking the document from the drive, which the trigger still reports.
export function lifecycleKindForDriveAction(
  actionType: string,
): TriggerKind | undefined {
  if (actionType === "ADD_FILE") return "document-created";
  if (actionType === "DELETE_NODE") return "document-deleted";
  return undefined;
}

function toList(value: unknown): string[] | undefined {
  if (typeof value === "string") return value ? [value] : undefined;
  if (Array.isArray(value)) {
    const strings = value.filter((item) => typeof item === "string");
    return strings.length > 0 ? strings : undefined;
  }
  return undefined;
}

function asRecord(config: unknown): Record<string, unknown> {
  if (config === null || typeof config !== "object") return {};
  return config as Record<string, unknown>;
}

export function parseEventFilter(config: unknown): DocumentEventFilter {
  const record = asRecord(config);
  return {
    documentType: toList(record.documentType),
    documentId: toList(record.documentId),
    actionType: toList(record.actionType),
  };
}

export function parseLifecycleFilter(config: unknown): LifecycleFilter {
  const record = asRecord(config);
  return {
    documentType: toList(record.documentType),
    driveId: toList(record.driveId),
  };
}

const ok = (list: string[] | undefined, value: string | undefined) =>
  !list || (value !== undefined && list.includes(value));

export function matchesEventFilter(
  filter: DocumentEventFilter,
  documentType: string,
  documentId: string,
  actionType: string,
): boolean {
  return (
    ok(filter.documentType, documentType) &&
    ok(filter.documentId, documentId) &&
    ok(filter.actionType, actionType)
  );
}

// documentType is undefined when it can't be resolved (e.g. a drive node
// deletion for a document that is already gone); a set type filter then
// rejects rather than firing on an unconfirmed match. driveId is null for a
// document that belongs to no drive, which a set driveId also rejects.
export function matchesLifecycleFilter(
  filter: LifecycleFilter,
  documentType: string | undefined | null,
  driveId: string | undefined | null,
): boolean {
  return (
    ok(filter.documentType, documentType ?? undefined) &&
    ok(filter.driveId, driveId ?? undefined)
  );
}
