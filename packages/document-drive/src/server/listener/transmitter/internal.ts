import { Document, Operation, OperationScope } from "document-model/document";
import { logger } from "../../../utils/logger";
import {
  IBaseDocumentDriveServer,
  Listener,
  ListenerRevision,
  OperationUpdate,
  StrandUpdate,
} from "../../types";
import { buildRevisionsFilter } from "../../utils";
import { ITransmitter, StrandUpdateSource } from "./types";
import { InferDocumentOperation } from "../../../read-mode/types";

export interface IReceiver<
  T extends Document = Document,
  S extends OperationScope = OperationScope,
> {
  onStrands: (strands: InternalTransmitterUpdate<T, S>[]) => Promise<void>;
  onDisconnect: () => Promise<void>;
}

export type InternalOperationUpdate<
  D extends Document = Document,
  S extends OperationScope = OperationScope,
> = Omit<Operation<InferDocumentOperation<D>>, "scope"> & {
  state: D["state"][S];
  previousState: D["state"][S];
};

export type InternalTransmitterUpdate<
  T extends Document = Document,
  S extends OperationScope = OperationScope,
> = {
  driveId: string;
  documentId: string;
  scope: S;
  branch: string;
  operations: InternalOperationUpdate<T, S>[];
  state: T["state"][S];
};

export interface IInternalTransmitter extends ITransmitter {
  setReceiver(receiver: IReceiver): void;
}

export class InternalTransmitter implements ITransmitter {
  protected drive: IBaseDocumentDriveServer;
  protected listener: Listener;
  protected receiver: IReceiver | undefined;

  constructor(listener: Listener, drive: IBaseDocumentDriveServer) {
    this.listener = listener;
    this.drive = drive;
  }

  async transmit(
    strands: StrandUpdate[],
    source: StrandUpdateSource,
  ): Promise<ListenerRevision[]> {
    if (!this.receiver) {
      return [];
    }

    const retrievedDocuments = new Map<string, Document>();
    const updates: InternalTransmitterUpdate[] = [];
    for (const strand of strands) {
      let document = retrievedDocuments.get(
        `${strand.driveId}:${strand.documentId}`,
      );
      if (!document) {
        const revisions = buildRevisionsFilter(
          strands,
          strand.driveId,
          strand.documentId,
        );
        document = await (strand.documentId
          ? this.drive.getDocument(strand.driveId, strand.documentId, {
              revisions,
            })
          : this.drive.getDrive(strand.driveId, { revisions }));

        retrievedDocuments.set(
          `${strand.driveId}:${strand.documentId}`,
          document,
        );
      }
      updates.push({ ...strand, state: document.state[strand.scope] });
    }
    try {
      await this.receiver.onStrands(updates);
      return strands.map(({ operations, ...s }) => ({
        ...s,
        status: "SUCCESS",
        revision: operations.at(operations.length - 1)?.index ?? -1,
      }));
    } catch (error) {
      logger.error(error);
      // TODO check which strand caused an error
      return strands.map(({ operations, ...s }) => ({
        ...s,
        status: "ERROR",
        revision: (operations.at(0)?.index ?? 0) - 1,
      }));
    }
  }

  setReceiver(receiver: IReceiver) {
    this.receiver = receiver;
  }

  async disconnect(): Promise<void> {
    await this.receiver?.onDisconnect();
  }

  getListener(): Listener {
    return this.listener;
  }
}
