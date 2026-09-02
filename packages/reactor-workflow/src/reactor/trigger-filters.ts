// Pure config parsing/matching for the document trigger kinds. Each config
// field is a string or list; an omitted field matches every value.

export const DOCUMENT_EVENT_BLOCK = "core#document-event";
export const DOCUMENT_CREATED_BLOCK = "core#document-created";
export const DOCUMENT_DELETED_BLOCK = "core#document-deleted";

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

// Lifecycle triggers match drive ADD_FILE / DELETE_NODE operations.
export interface LifecycleFilter {
  documentType?: string[];
  driveId?: string[];
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

// documentType is undefined when it can't be resolved (e.g. after deletion);
// a set type filter then rejects rather than firing on an unconfirmed match.
export function matchesLifecycleFilter(
  filter: LifecycleFilter,
  documentType: string | undefined,
  driveId: string,
): boolean {
  return ok(filter.documentType, documentType) && ok(filter.driveId, driveId);
}
