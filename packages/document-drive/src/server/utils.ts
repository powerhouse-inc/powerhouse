import type { Action, DocumentOperations, PHDocument } from "document-model";
import {
  type CreateDocumentInput,
  type RevisionsFilter,
  type StrandUpdate,
  type SynchronizationUnitId,
} from "./types.js";

export function buildRevisionsFilter(
  strands: StrandUpdate[],
  driveId: string,
  documentId: string,
): RevisionsFilter {
  return strands.reduce<RevisionsFilter>((acc, s) => {
    if (!(s.driveId === driveId && s.documentId === documentId)) {
      return acc;
    }
    acc[s.scope] = s.operations[s.operations.length - 1]?.index ?? -1;
    return acc;
  }, {});
}

export function buildDocumentRevisionsFilter(
  document: PHDocument,
): RevisionsFilter {
  return Object.entries(document.operations).reduce<RevisionsFilter>(
    (acc, [scope, operations]) => {
      acc[scope] = operations.at(-1)?.index ?? -1;
      return acc;
    },
    {} as RevisionsFilter,
  );
}

export function filterOperationsByRevision<TAction extends Action = Action>(
  operations: DocumentOperations<TAction>,
  revisions?: RevisionsFilter,
): DocumentOperations<TAction> {
  if (!revisions) {
    return operations;
  }
  return Object.keys(operations).reduce(
    (acc, scope) => {
      const revision = revisions[scope];
      if (revision !== undefined) {
        acc[scope] = operations[scope].filter((op) => op.index <= revision);
      }
      return acc;
    },
    { global: [], local: [] } as DocumentOperations<TAction>,
  );
}

export function isAtRevision(
  document: PHDocument,
  revisions?: RevisionsFilter,
): boolean {
  return (
    !revisions ||
    Object.entries(revisions).find(([scope, revision]) => {
      const operation = document.operations[scope].at(-1);
      if (revision === -1) {
        return operation !== undefined;
      }
      return operation?.index !== revision;
    }) === undefined
  );
}

export function isAfterRevision(
  document: PHDocument,
  revisions?: RevisionsFilter,
): boolean {
  return (
    !revisions ||
    Object.entries(revisions).every(([scope, revision]) => {
      const operation = document.operations[scope].at(-1);

      if (revision === -1) {
        return operation !== undefined;
      }
      return (
        operation !== undefined &&
        revision !== undefined &&
        operation.index > revision
      );
    })
  );
}

export function compareSyncUnits(
  a: SynchronizationUnitId,
  b: SynchronizationUnitId,
) {
  return (
    a.documentId === b.documentId &&
    a.scope === b.scope &&
    a.branch === b.branch
  );
}

export function resolveCreateDocumentInput<TDocument extends PHDocument>(
  input: CreateDocumentInput<TDocument>,
) {
  return {
    id: resolveCreateDocumentInputId(input),
    documentType: resolveCreateDocumentInputDocumentType(input),
    document: resolveCreateDocumentInputDocument(input),
  };
}

export function resolveCreateDocumentInputId(
  input: CreateDocumentInput<PHDocument>,
) {
  if ("id" in input) {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return input.id;
  } else if ("header" in input) {
    return input.header.id;
  } else if ("document" in input) {
    return input.document.header.id;
  } else {
    return undefined;
  }
}

export function resolveCreateDocumentInputDocumentType(
  input: CreateDocumentInput<PHDocument>,
) {
  if ("documentType" in input) {
    return input.documentType;
  } else if ("header" in input) {
    return input.header.documentType;
  } else {
    return input.document.header.documentType;
  }
}

export function resolveCreateDocumentInputDocument<
  TDocument extends PHDocument,
>(input: CreateDocumentInput<TDocument>) {
  return "document" in input ? input.document : undefined;
}
