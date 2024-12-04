import { Document, OperationScope, State } from "document-model/document";
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

export interface IReceiver {
  transmit: (strands: InternalTransmitterUpdate[]) => Promise<void>;
  disconnect: () => Promise<void>;
}

export type InternalOperationUpdate<
  T extends Document = Document,
  S extends OperationScope = OperationScope,
> = OperationUpdate & {
  state: T["state"][S];
  previousState: T["state"][S];
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
  private drive: IBaseDocumentDriveServer;
  private listener: Listener;
  private receiver: IReceiver | undefined;

  constructor(listener: Listener, drive: IBaseDocumentDriveServer) {
    this.listener = listener;
    this.drive = drive;
  }

  async #buildInternalOperationUpdate(strand: StrandUpdate) {
    const operations: InternalOperationUpdate[] = [];

    const stateByIndex = new Map<number, unknown>();

    const getStateByIndex = async (index: number) => {
      const state = stateByIndex.get(index);
      if (state) {
        return state;
      }

      const document = await this.drive.getDocument(
        strand.driveId,
        strand.documentId,
        {
          revisions: {
            [strand.scope]: index,
          },
          checkHashes: false,
        },
      );

      stateByIndex.set(index, document.state[strand.scope]);
      return stateByIndex.get(index);
    };

    for (const operation of strand.operations) {
      operations.push({
        ...operation,
        state: await getStateByIndex(operation.index),
        previousState:
          operation.index > 0 ? await getStateByIndex(operation.index - 1) : {},
      });
    }
    return operations;
  }

  async transmit(strands: StrandUpdate[]): Promise<ListenerRevision[]> {
    if (!this.receiver) {
      return [];
    }

    const updates: InternalTransmitterUpdate[] = [];
    for (const strand of strands) {
      const operations = await this.#buildInternalOperationUpdate(strand);
      const state = operations.at(-1)?.state ?? {};

      updates.push({
        ...strand,
        operations,
        state,
      });
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
