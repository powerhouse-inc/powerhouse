import type {
  IDocumentDriveServer,
  ListenerRevision,
  PullResponderTransmitter,
  StrandUpdate,
} from "document-drive";
import { operationsToRevision } from "document-drive";
import type { InternalStrandUpdate } from "@powerhousedao/reactor-api";

// processes a strand update and returns a listener revision
export const processPushUpdate = async (
  reactor: IDocumentDriveServer,
  strand: InternalStrandUpdate,
): Promise<ListenerRevision> => {
  const existingDocuments = strand.driveId
    ? await reactor.getDocuments(strand.driveId)
    : [];
  const isNewDocument = !existingDocuments.includes(strand.documentId);

  if (isNewDocument) {
    const result = await processPushNewDocument(reactor, strand);
    if (result.status !== "SUCCESS" || strand.operations.length === 0) {
      return result;
    }
  }

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

export const processPushNewDocument = async (
  reactor: IDocumentDriveServer,
  strand: InternalStrandUpdate,
): Promise<ListenerRevision> => {
  const listenerRevision: Omit<ListenerRevision, "status" | "error"> = {
    revision: 0,
    branch: strand.branch,
    documentId: strand.documentId,
    documentType: strand.documentType,
    driveId: strand.driveId,
    scope: strand.scope,
  };

  try {
    const result = await reactor.queueDocument({
      id: strand.documentId,
      documentType: strand.documentType,
    });

    return {
      ...listenerRevision,
      revision: operationsToRevision(result.operations),
      status: result.status,
      error: result.error?.message,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.constructor.name === "DocumentAlreadyExistsError"
    ) {
      return {
        ...listenerRevision,
        status: "SUCCESS",
      };
    } else {
      return {
        ...listenerRevision,
        status: "ERROR",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
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
