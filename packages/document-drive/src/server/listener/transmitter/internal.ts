import { Document, OperationScope } from "document-model/document";
import { logger } from "../../../utils/logger";
import {
  IBaseDocumentDriveServer,
  Listener,
  ListenerRevision,
  OperationUpdate,
  StrandUpdate,
} from "../../types";
import { buildRevisionsFilter } from "../../utils";
import { ITransmitter } from "./types";

export interface IReceiver {
  transmit: (strands: InternalTransmitterUpdate[]) => Promise<void>;
  disconnect: () => Promise<void>;
}

export type InternalTransmitterUpdate<
  T extends Document = Document,
  S extends OperationScope = OperationScope,
> = {
  driveId: string;
  documentId: string;
  scope: S;
  branch: string;
  operations: OperationUpdate[];
  state: T["state"][S];
};

export interface IInternalTransmitter extends ITransmitter {
  setReceiver(receiver: IReceiver): void;
}

export class InternalTransmitter implements ITransmitter {
  private drive: IBaseDocumentDriveServer;
  private listener: Listener;
  private receiver: IReceiver | undefined;

  constructor(listener: Listener, drive: IBaseDocumentDriveServer) {
    this.listener = listener;
    this.drive = drive;
  }

  async transmit(
    strands: InternalTransmitterUpdate[],
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
      await this.receiver.transmit(updates);
      return strands.map(({ operations, ...s }) => ({
        ...s,
        status: "SUCCESS",
        revision: operations[operations.length - 1]?.index ?? -1,
      }));
    } catch (error) {
      logger.error(error);
      // TODO check which strand caused an error
      return strands.map(({ operations, ...s }) => ({
        ...s,
        status: "ERROR",
        revision: (operations[0]?.index ?? 0) - 1,
      }));
    }
  }

  setReceiver(receiver: IReceiver) {
    this.receiver = receiver;
  }

  async disconnect(): Promise<void> {
    await this.receiver?.disconnect();
  }
}
