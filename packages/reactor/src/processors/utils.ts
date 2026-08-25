import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type {
  ProcessorFilter,
  ProcessorRecord,
} from "@powerhousedao/shared/processors";
import type { PHDocumentHeader } from "@powerhousedao/shared/document-model";

export function isDriveDeletion(op: OperationWithContext): boolean {
  return op.operation.action.type === "DELETE_DOCUMENT";
}

export function extractDriveHeader(
  op: OperationWithContext,
): PHDocumentHeader | undefined {
  if (!op.context.resultingState) return undefined;

  const state = JSON.parse(op.context.resultingState) as Record<
    string,
    unknown
  >;
  return state.header as PHDocumentHeader | undefined;
}

export function extractDeletedDocumentId(
  op: OperationWithContext,
): string | undefined {
  const input = op.operation.action.input as { documentId?: string };
  return input.documentId ?? op.context.documentId;
}

export function createMinimalDriveHeader(
  driveId: string,
  documentType: string,
): PHDocumentHeader {
  return {
    id: driveId,
    documentType,
    sig: {
      publicKey: {},
      nonce: "",
    },
    slug: "",
    name: "",
    branch: "main",
    revision: {},
    createdAtUtcIso: new Date().toISOString(),
    lastModifiedAtUtcIso: new Date().toISOString(),
  };
}

export function matchesFilter(
  op: OperationWithContext,
  filter: ProcessorFilter,
): boolean {
  if (filter.documentType && filter.documentType.length > 0) {
    if (!filter.documentType.includes(op.context.documentType)) {
      return false;
    }
  }

  if (filter.scope && filter.scope.length > 0) {
    if (!filter.scope.includes(op.context.scope)) {
      return false;
    }
  }

  if (filter.branch && filter.branch.length > 0) {
    if (!filter.branch.includes(op.context.branch)) {
      return false;
    }
  }

  if (filter.documentId && filter.documentId.length > 0) {
    const hasWildcard = filter.documentId.includes("*");
    if (!hasWildcard && !filter.documentId.includes(op.context.documentId)) {
      return false;
    }
  }

  return true;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function namespaceOf(processor: object): string | undefined {
  return nonEmpty((processor as { namespace?: unknown }).namespace);
}

function classNameOf(processor: object): string | undefined {
  const name = processor.constructor.name;
  return name && name !== "Object" ? name : undefined;
}

// Cursor key of each record within its factory and drive. Legacy mode keeps
// the array index; otherwise id, then namespace, then class name, then index.
export function resolveProcessorSlots(
  records: ProcessorRecord[],
  legacy: boolean,
): string[] {
  if (legacy) return records.map((_, i) => String(i));

  const seen = new Map<string, number>();
  return records.map((record, i) => {
    const base =
      nonEmpty(record.id) ??
      namespaceOf(record.processor) ??
      classNameOf(record.processor) ??
      String(i);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}#${count}`;
  });
}
