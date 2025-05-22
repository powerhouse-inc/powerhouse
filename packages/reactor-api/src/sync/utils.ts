import {
  type IDocumentDriveServer,
  type ListenerRevision,
  type PullResponderTransmitter,
  type StrandUpdate,
} from "document-drive";
import { operationsToRevision } from "document-drive/utils/misc";
import { type Operation, type OperationScope } from "document-model";

// define types
export type InternalStrandUpdate = {
  operations: Operation[];
  documentId: string;
  documentType: string;
  driveId: string;
  scope: OperationScope;
  branch: string;
};

// processes a strand update and returns a listener revision
export const processPushUpdate = async (
  reactor: IDocumentDriveServer,
  strand: InternalStrandUpdate,
): Promise<ListenerRevision> => {
  const result = await reactor.queueOperations(
    strand.documentId,
    strand.operations,
  );

  return {
    revision: operationsToRevision(result.operations),
    branch: strand.branch,
    documentId: strand.documentId,
    documentType: strand.documentType,
    driveId: strand.driveId,
    scope: strand.scope,
    status: result.status,
    error: result.error?.message,
  };
};

// processes an acknowledge request and returns a boolean
export const processAcknowledge = async (
  reactor: IDocumentDriveServer,
  driveId: string,
  listenerId: string,
  revisions: ListenerRevision[],
): Promise<boolean> => {
  // todo: use listener manager
  const listener = reactor.listeners.getListenerState(driveId, listenerId);
  const transmitter = listener.listener.transmitter as PullResponderTransmitter;
  return transmitter.processAcknowledge(driveId, listenerId, revisions);
};

// processes a get strands request and returns a list of strand updates
export const processGetStrands = async (
  reactor: IDocumentDriveServer,
  driveId: string,
  listenerId: string,
  since: string | undefined,
): Promise<StrandUpdate[]> => {
  // todo: use listener manager
  const listener = reactor.listeners.getListenerState(driveId, listenerId);
  const transmitter = listener.listener.transmitter as PullResponderTransmitter;
  return transmitter.getStrands({ since });
};
