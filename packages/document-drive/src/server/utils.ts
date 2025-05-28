import type {
  Action,
  DocumentOperations,
  OperationScope,
  PHDocument,
} from "document-model";
import {
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
      acc[scope as OperationScope] = operations.at(-1)?.index ?? -1;
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
      const revision = revisions[scope as OperationScope];
      if (revision !== undefined) {
        acc[scope as OperationScope] = operations[
          scope as OperationScope
        ].filter((op) => op.index <= revision);
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
      const operation = document.operations[scope as OperationScope].at(-1);
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
      const operation = document.operations[scope as OperationScope].at(-1);

      if (revision === -1) {
        return operation !== undefined;
      }
      return operation && operation.index > revision;
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
