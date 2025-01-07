import { Document, Operation, OperationScope } from "document-model/document";
import { logger } from "../../../utils/logger";
import {
  GetDocumentOptions,
  IBaseDocumentDriveServer,
  Listener,
  ListenerRevision,
  StrandUpdate,
} from "../../types";
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
  D extends Document = Document,
  S extends OperationScope = OperationScope,
> = {
  driveId: string;
  documentId: string;
  scope: S;
  branch: string;
  operations: InternalOperationUpdate<D, S>[];
  state: D["state"][S];
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

  async #buildInternalOperationUpdate(strand: StrandUpdate) {
    const operations: InternalOperationUpdate[] = [];
    const stateByIndex = new Map<number, unknown>();
    const getStateByIndex = async (index: number) => {
      const state = stateByIndex.get(index);
      if (state) {
        return state;
      }

      const getDocumentOptions: GetDocumentOptions = {
        revisions: {
          [strand.scope]: index,
        },
        checkHashes: false,
      };
      const document = await (strand.documentId
        ? this.drive.getDocument(
            strand.driveId,
            strand.documentId,
            getDocumentOptions,
          )
        : this.drive.getDrive(strand.driveId, getDocumentOptions));

      if (index < 0) {
        stateByIndex.set(index, document.initialState.state[strand.scope]);
      } else {
        stateByIndex.set(index, document.state[strand.scope]);
      }
      return stateByIndex.get(index);
    };
    for (const operation of strand.operations) {
      operations.push({
        ...operation,
        state: await getStateByIndex(operation.index),
        previousState: await getStateByIndex(operation.index - 1),
      });
    }
    return operations;
  }

  async transmit(
    strands: StrandUpdate[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _source: StrandUpdateSource,
  ): Promise<ListenerRevision[]> {
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
