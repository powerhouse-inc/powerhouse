import { RevisionsFilter, StrandUpdate } from "@server/types";
import type { BaseAction, BaseDocument, OperationScope } from "document-model";

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

export function buildDocumentRevisionsFilter<TGlobalState, TLocalState, TAction extends BaseAction>(
  document: BaseDocument<TGlobalState, TLocalState, TAction>,
): RevisionsFilter {
  return Object.entries(document.operations).reduce<RevisionsFilter>(
    (acc, [scope, operations]) => {
      acc[scope as OperationScope] = operations.at(-1)?.index ?? -1;
      return acc;
    },
    {} as RevisionsFilter,
  );
}

export function filterOperationsByRevision<TGlobalState, TLocalState, TAction extends BaseAction, TDocument extends BaseDocument<TGlobalState, TLocalState, TAction>>(
  operations: TDocument["operations"],
  revisions?: RevisionsFilter,
): TDocument["operations"] {
  if (!revisions) {
    return operations;
  }
  return (Object.keys(operations) as OperationScope[]).reduce<
    TDocument["operations"]
  >(
    (acc, scope) => {
      const revision = revisions[scope];
      if (revision !== undefined) {
        acc[scope] = operations[scope].filter((op) => op.index <= revision);
      }
      return acc;
    },
    { global: [], local: [] } as TDocument["operations"],
  );
}

export function isAtRevision<TGlobalState, TLocalState, TAction extends BaseAction>(
  document: BaseDocument<TGlobalState, TLocalState, TAction>,
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

export function isAfterRevision<TGlobalState, TLocalState, TAction extends BaseAction>(
  document: BaseDocument<TGlobalState, TLocalState, TAction>,
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
