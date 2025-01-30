import { IDocumentDriveServer, ListenerRevision } from "document-drive";
import { DocumentDriveAction } from "document-model-libs/document-drive";
import { BaseAction, Operation, OperationScope } from "document-model/document";

// define types
export type InternalStrandUpdate = {
  operations: Operation[];
  documentId: string;
  driveId: string;
  scope: OperationScope;
  branch: string;
};

// processes a strand update and returns a listener revision
export const pushUpdate = async (
  reactor: IDocumentDriveServer,
  strand: InternalStrandUpdate
): Promise<ListenerRevision> => {
  const result = await (strand.documentId !== undefined
    ? reactor.queueOperations(
        strand.driveId,
        strand.documentId,
        strand.operations
      )
    : reactor.queueDriveOperations(
        strand.driveId,
        strand.operations as Operation<DocumentDriveAction | BaseAction>[]
      ));

  const scopeOperations = result.document?.operations[strand.scope] ?? [];
  if (scopeOperations.length === 0) {
    return {
      revision: -1,
      branch: strand.branch,
      documentId: strand.documentId ?? "",
      driveId: strand.driveId,
      scope: strand.scope,
      status: result.status,
    };
  }

  const revision = scopeOperations.slice().pop()?.index ?? -1;
  return {
    revision,
    branch: strand.branch,
    documentId: strand.documentId ?? "",
    driveId: strand.driveId,
    scope: strand.scope,
    status: result.status,
    error: result.error?.message || undefined,
  };
};
