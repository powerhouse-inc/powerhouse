import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { ProcessorFilter } from "@powerhousedao/shared/processors";
import type { PHDocumentHeader } from "document-model";

const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";

export function isDriveCreation(op: OperationWithContext): boolean {
  return (
    op.operation.action.type === "CREATE_DOCUMENT" &&
    op.context.documentType === DRIVE_DOCUMENT_TYPE
  );
}

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

export function createMinimalDriveHeader(driveId: string): PHDocumentHeader {
  return {
    id: driveId,
    documentType: DRIVE_DOCUMENT_TYPE,
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
