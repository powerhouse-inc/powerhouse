import {
  DocumentDriveAction,
  IDocumentDriveServer,
  ListenerRevision,
  PullResponderTransmitter,
  StrandUpdate,
} from "document-drive";
import { Operation, OperationScope } from "document-model";

// define types
export type InternalStrandUpdate = {
  operations: Operation[];
  documentId: string;
  driveId: string;
  scope: OperationScope;
  branch: string;
};

// processes a strand update and returns a listener revision
export const processPushUpdate = async (
  reactor: IDocumentDriveServer,
  strand: InternalStrandUpdate,
): Promise<ListenerRevision> => {
  const result = await (strand.documentId !== undefined
    ? reactor.queueOperations(
        strand.driveId,
        strand.documentId,
        strand.operations,
      )
    : reactor.queueDriveOperations(
        strand.driveId,
        strand.operations as Operation<DocumentDriveAction>[],
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

// processes an acknowledge request and returns a boolean
export const processAcknowledge = async (
  reactor: IDocumentDriveServer,
  driveId: string,
  listenerId: string,
  revisions: ListenerRevision[],
): Promise<boolean> => {
  const transmitter = (await reactor.getTransmitter(
    driveId,
    listenerId,
  )) as PullResponderTransmitter;
  return transmitter.processAcknowledge(driveId, listenerId, revisions);
};

// processes a get strands request and returns a list of strand updates
export const processGetStrands = async (
  reactor: IDocumentDriveServer,
  driveId: string,
  listenerId: string,
  since: string | undefined,
): Promise<StrandUpdate[]> => {
  const transmitter = (await reactor.getTransmitter(
    driveId,
    listenerId,
  )) as PullResponderTransmitter;
  return transmitter.getStrands({ since });
};
