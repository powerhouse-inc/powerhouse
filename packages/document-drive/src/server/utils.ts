import type {
  BaseDocument,
  DocumentOperations,
  OperationScope,
} from "document-model";
import { RevisionsFilter, StrandUpdate } from "./types.js";

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

export function buildDocumentRevisionsFilter<TGlobalState, TLocalState>(
  document: BaseDocument<TGlobalState, TLocalState>,
): RevisionsFilter {
  return Object.entries(document.operations).reduce<RevisionsFilter>(
    (acc, [scope, operations]) => {
      acc[scope as OperationScope] = operations.at(-1)?.index ?? -1;
      return acc;
    },
    {} as RevisionsFilter,
  );
}

export function filterOperationsByRevision<TGlobalState, TLocalState>(
  operations: DocumentOperations,
  revisions?: RevisionsFilter,
) {
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
    { global: [], local: [] } as DocumentOperations,
  );
}

export function isAtRevision<TGlobalState, TLocalState>(
  document: BaseDocument<TGlobalState, TLocalState>,
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

export function isAfterRevision<TGlobalState, TLocalState>(
  document: BaseDocument<TGlobalState, TLocalState>,
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
