import type {
  Document,
  Operation,
  OperationScope,
} from "document-model/document";
import { RevisionsFilter, StrandUpdate } from "./types";

export function buildRevisionsFilter(
  strands: StrandUpdate[],
  driveId: string,
  documentId: string
): RevisionsFilter {
  return strands.reduce<RevisionsFilter>((acc, s) => {
    if (!(s.driveId === driveId && s.documentId === documentId)) {
      return acc;
    }
    acc[s.scope] = s.operations[s.operations.length - 1]?.index ?? -1;
    return acc;
  }, {});
}

export function filterOperationsByRevision(
  operations: Document["operations"],
  revisions?: RevisionsFilter
): Document["operations"] {
  if (!revisions) {
    return operations;
  }
  return (Object.keys(operations) as OperationScope[]).reduce<
    Document["operations"]
  >((acc, scope) => {
    const revision = revisions[scope];
    if (revision !== undefined) {
      acc[scope] = operations[scope].filter((op) => op.index <= revision);
    }
    return acc;
  }, operations);
}

export function groupOperationsBySyncUnit(operations: Operation[]): {
  scope: OperationScope;
  branch: string;
  operations: Operation[];
}[] {
  const groupedOperations: Record<
    string,
    {
      scope: OperationScope;
      branch: string;
      operations: Operation[];
    }
  > = {};

  operations.forEach((operation) => {
    // Find the corresponding sync unit for the action
    const branch =
      "branch" in operation ? (operation.branch as string) : "main";
    const key = `${operation.scope}-${branch}`;

    if (!groupedOperations[key]) {
      groupedOperations[key] = {
        scope: operation.scope,
        branch,
        operations: [],
      };
    }

    groupedOperations[key].operations.push(operation);
  });

  return Object.values(groupedOperations);
}
