import { type IProcessor } from "#processors/types";
import {
  type GetDocumentOptions,
  type IBaseDocumentDriveServer,
  type IDocumentDriveServer,
  type ListenerRevision,
  type StrandUpdate,
} from "#server/types";
import { logger } from "#utils/logger";
import { operationsToRevision } from "#utils/misc";
import { RunAsap } from "#utils/run-asap";
import { type Action, type Operation, type PHBaseState } from "document-model";
import { type ITransmitter, type StrandUpdateSource } from "./types.js";

export type InternalOperationUpdate = Omit<Operation, "scope"> & {
  /** The state, for a specific scope, of the document */
  state?: PHBaseState;
  /** The previous state, for a specific scope, of the document */
  previousState?: PHBaseState;
};

export type InternalTransmitterUpdate = {
  driveId: string;
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
  operations: InternalOperationUpdate[];
  state: any; // The current state (global or local) for the scope
};

export class InternalTransmitter implements ITransmitter {
  protected drive: IBaseDocumentDriveServer;
  protected processor: IProcessor;
  protected taskQueueMethod: RunAsap.RunAsap<unknown> | null;
  protected transmitQueue: Promise<ListenerRevision[]> | undefined;

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

  async #buildInternalOperationUpdate(
    strand: StrandUpdate,
  ): Promise<InternalOperationUpdate[]> {
    const operations: InternalOperationUpdate[] = [];
    const stateByIndex = new Map<number, PHBaseState>();

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
      const document = await (strand.documentId === strand.driveId
        ? this.drive.getDrive(strand.driveId, getDocumentOptions)
        : this.drive.getDocument(strand.documentId, getDocumentOptions));

      if (index < 0) {
        stateByIndex.set(
          index,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
          (document.initialState as any)[strand.scope],
        );
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        stateByIndex.set(index, (document.state as any)[strand.scope]);
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

      const action: Action = {
        id: operation.actionId,
        timestampUtcMs: operation.timestampUtcMs,
        type: operation.type,
        input: operation.input,
        context: operation.context,
        scope: strand.scope,
      };

      operations.push({
        ...operation,
        state,
        previousState,
        action,
      });
    }

    return operations;
  }

  async transmit(
    strands: StrandUpdate[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _source: StrandUpdateSource,
  ): Promise<ListenerRevision[]> {
    const task = async (): Promise<ListenerRevision[]> => {
      const updates = [];
      for (const strand of strands) {
        const operations = await this.#buildInternalOperationUpdate(strand);
        const document = await this.drive.getDocument(strand.documentId);
        const state = operations.at(-1)?.state ?? ({} as PHBaseState);
        updates.push({
          ...strand,
          documentType: document.header.documentType,
          operations,
          state,
        });
      }

      try {
        await this.processor.onStrands(updates);
        return strands.map(({ operations, ...s }) => {
          return {
            ...s,
            status: "SUCCESS",
            revision: operationsToRevision(operations),
          };
        });
      } catch (error) {
        logger.error(error);
        // TODO check which strand caused an error
        return strands.map(({ operations, ...s }) => ({
          ...s,
          status: "ERROR",
          revision: operations.at(0)?.index ?? 0,
        }));
      }
    };

    // adds to queue so that each `transmit` is processed at a time to avoid concurrency issues
    this.transmitQueue = this.transmitQueue?.then(() => task()) ?? task();
    return this.transmitQueue;
  }

  async disconnect(): Promise<void> {
    await this.processor.onDisconnect();
  }
}
