import { type IProcessor } from "#processors/types";
import {
  type GetDocumentOptions,
  type IBaseDocumentDriveServer,
  type IDocumentDriveServer,
  type ListenerRevision,
  type StrandUpdate,
} from "#server/types";
import { logger } from "#utils/logger";
import { RunAsap } from "#utils/run-asap";
import {
  type GlobalStateFromDocument,
  type LocalStateFromDocument,
  type OperationFromDocument,
  type OperationScope,
  type PHDocument,
} from "document-model";
import { type ITransmitter, type StrandUpdateSource } from "./types.js";

export type InternalOperationUpdate<TDocument extends PHDocument> = Omit<
  OperationFromDocument<TDocument>,
  "scope"
> & {
  state: GlobalStateFromDocument<TDocument> | LocalStateFromDocument<TDocument>;
  previousState:
    | GlobalStateFromDocument<TDocument>
    | LocalStateFromDocument<TDocument>;
};

export type InternalTransmitterUpdate<TDocument extends PHDocument> = {
  driveId: string;
  documentId: string;
  scope: OperationScope;
  branch: string;
  operations: InternalOperationUpdate<TDocument>[];
  state: GlobalStateFromDocument<TDocument> | LocalStateFromDocument<TDocument>;
};

export class InternalTransmitter implements ITransmitter {
  protected drive: IBaseDocumentDriveServer;
  protected processor: IProcessor;
  protected taskQueueMethod: RunAsap.RunAsap<unknown> | null;

  constructor(
    drive: IDocumentDriveServer,
    processor: IProcessor,
    taskQueueMethod?: RunAsap.RunAsap<unknown> | null,
  ) {
    this.drive = drive;
    this.processor = processor;
    this.taskQueueMethod =
      taskQueueMethod === undefined ? RunAsap.runAsap : taskQueueMethod;
  }

  async #buildInternalOperationUpdate<TDocument extends PHDocument>(
    strand: StrandUpdate,
  ) {
    const operations = [];
    const stateByIndex = new Map<
      number,
      GlobalStateFromDocument<TDocument> | LocalStateFromDocument<TDocument>
    >();
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
        ? this.drive.getDocument<TDocument>(
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
      const stateTask = () => getStateByIndex(operation.index);
      const state = await (this.taskQueueMethod
        ? RunAsap.runAsapAsync(stateTask, this.taskQueueMethod)
        : stateTask());

      const previousStateTask = () => getStateByIndex(operation.index - 1);
      const previousState = await (this.taskQueueMethod
        ? RunAsap.runAsapAsync(previousStateTask, this.taskQueueMethod)
        : previousStateTask());

      operations.push({
        ...operation,
        state,
        previousState,
      });
    }
    return operations;
  }

  async transmit(
    strands: StrandUpdate[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _source: StrandUpdateSource,
  ): Promise<ListenerRevision[]> {
    const updates = [];
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
      await this.processor.onStrands(updates);
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

  async disconnect(): Promise<void> {
    await this.processor.onDisconnect();
  }
}
