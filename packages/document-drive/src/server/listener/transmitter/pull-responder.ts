import { ListenerFilter, Trigger } from "document-model-libs/document-drive";
import { Operation, OperationScope } from "document-model/document";
import { PULL_DRIVE_INTERVAL } from "../..";
import { generateUUID } from "../../../utils";
import { gql, requestGraphql } from "../../../utils/graphql";
import { logger as defaultLogger } from "../../../utils/logger";
import { OperationError } from "../../error";
import {
  GetStrandsOptions,
  IBaseDocumentDriveServer,
  IOperationResult,
  Listener,
  ListenerRevision,
  ListenerRevisionWithError,
  OperationUpdate,
  RemoteDriveOptions,
  StrandUpdate,
} from "../../types";
import { ListenerManager } from "../manager";
import {
  ITransmitter,
  PullResponderTrigger,
  StrandUpdateSource,
} from "./types";

export type OperationUpdateGraphQL = Omit<OperationUpdate, "input"> & {
  input: string;
};

export type PullStrandsGraphQL = {
  system: {
    sync: {
      strands: StrandUpdateGraphQL[];
    };
  };
};

export type CancelPullLoop = () => void;

export type StrandUpdateGraphQL = Omit<StrandUpdate, "operations"> & {
  operations: OperationUpdateGraphQL[];
};

export interface IPullResponderTransmitter extends ITransmitter {
  getStrands(options?: GetStrandsOptions): Promise<StrandUpdate[]>;
}

export class PullResponderTransmitter implements IPullResponderTransmitter {
  private drive: IBaseDocumentDriveServer;
  private listener: Listener;
  private manager: ListenerManager;

  constructor(
    listener: Listener,
    drive: IBaseDocumentDriveServer,
    manager: ListenerManager,
  ) {
    this.listener = listener;
    this.drive = drive;
    this.manager = manager;
  }

  getStrands(options?: GetStrandsOptions): Promise<StrandUpdate[]> {
    return this.manager.getStrands(
      this.listener.driveId,
      this.listener.listenerId,
      options,
    );
  }

  disconnect(): Promise<void> {
    // TODO remove listener from switchboard
    return Promise.resolve();
  }

  async processAcknowledge(
    driveId: string,
    listenerId: string,
    revisions: ListenerRevision[],
  ): Promise<boolean> {
    const syncUnits = await this.manager.getListenerSyncUnitIds(
      driveId,
      listenerId,
    );
    let success = true;
    for (const revision of revisions) {
      const syncUnit = syncUnits.find(
        (s) =>
          s.scope === revision.scope &&
          s.branch === revision.branch &&
          s.driveId === revision.driveId &&
          s.documentId == revision.documentId,
      );
      if (!syncUnit) {
        defaultLogger.warn("Unknown sync unit was acknowledged", revision);
        success = false;
        continue;
      }

      await this.manager.updateListenerRevision(
        listenerId,
        driveId,
        syncUnit.syncId,
        revision.revision,
      );
    }

    return success;
  }

  static async registerPullResponder(
    driveId: string,
    url: string,
    filter: ListenerFilter,
  ): Promise<Listener["listenerId"]> {
    // graphql request to switchboard
    const result = await requestGraphql<{
      registerPullResponderListener: {
        listenerId: Listener["listenerId"];
      };
    }>(
      url,
      gql`
        mutation registerPullResponderListener($filter: InputListenerFilter!) {
          registerPullResponderListener(filter: $filter) {
            listenerId
          }
        }
      `,
      { filter },
    );

    const error = result.errors?.at(0);
    if (error) {
      throw error;
    }

    if (!result.registerPullResponderListener) {
      throw new Error("Error registering listener");
    }

    return result.registerPullResponderListener.listenerId;
  }

  static async pullStrands(
    driveId: string,
    url: string,
    listenerId: string,
    options?: GetStrandsOptions, // TODO add support for since
  ): Promise<StrandUpdate[]> {
    const result = await requestGraphql<PullStrandsGraphQL>(
      url,
      gql`
        query strands($listenerId: ID!) {
          system {
            sync {
              strands(listenerId: $listenerId) {
                driveId
                documentId
                scope
                branch
                operations {
                  id
                  timestamp
                  skip
                  type
                  input
                  hash
                  index
                  context {
                    signer {
                      user {
                        address
                        networkId
                        chainId
                      }
                      app {
                        name
                        key
                      }
                      signatures
                    }
                  }
                }
              }
            }
          }
        }
      `,
      { listenerId },
    );

    const error = result.errors?.at(0);
    if (error) {
      throw error;
    }

    if (!result.system) {
      return [];
    }

    return result.system.sync.strands.map((s) => ({
      ...s,
      operations: s.operations.map((o) => ({
        ...o,
        input: JSON.parse(o.input) as object,
      })),
    }));
  }

  static async acknowledgeStrands(
    driveId: string,
    url: string,
    listenerId: string,
    revisions: ListenerRevision[],
  ): Promise<boolean> {
    const result = await requestGraphql<{ acknowledge: boolean }>(
      url,
      gql`
        mutation acknowledge(
          $listenerId: String!
          $revisions: [ListenerRevisionInput]
        ) {
          acknowledge(listenerId: $listenerId, revisions: $revisions)
        }
      `,
      { listenerId, revisions },
    );
    const error = result.errors?.at(0);
    if (error) {
      throw error;
    }

    if (result.acknowledge === null) {
      throw new Error("Error acknowledging strands");
    }
    return result.acknowledge;
  }

  private static async executePull(
    driveId: string,
    trigger: PullResponderTrigger,
    onStrandUpdate: (
      strand: StrandUpdate,
      source: StrandUpdateSource,
    ) => Promise<IOperationResult>,
    onError: (error: Error) => void,
    onRevisions?: (revisions: ListenerRevisionWithError[]) => void,
    onAcknowledge?: (success: boolean) => void,
  ) {
    try {
      const { url, listenerId } = trigger.data;
      const strands = await PullResponderTransmitter.pullStrands(
        driveId,
        url,
        listenerId,
        // since ?
      );

      // if there are no new strands then do nothing
      if (!strands.length) {
        onRevisions?.([]);
        return;
      }

      const listenerRevisions: ListenerRevisionWithError[] = [];

      for (const strand of strands) {
        const operations: Operation[] = strand.operations.map((op) => ({
          ...op,
          scope: strand.scope,
          branch: strand.branch,
        }));

        let error: Error | undefined = undefined;
        try {
          const result = await onStrandUpdate(strand, {
            type: "trigger",
            trigger,
          });
          if (result.error) {
            throw result.error;
          }
        } catch (e) {
          error = e as Error;
          onError(error);
        }

        listenerRevisions.push({
          branch: strand.branch,
          documentId: strand.documentId || "",
          driveId: strand.driveId,
          revision: operations.pop()?.index ?? -1,
          scope: strand.scope,
          status: error
            ? error instanceof OperationError
              ? error.status
              : "ERROR"
            : "SUCCESS",
          error,
        });
      }

      onRevisions?.(listenerRevisions);

      await PullResponderTransmitter.acknowledgeStrands(
        driveId,
        url,
        listenerId,
        listenerRevisions.map((revision) => {
          const { error, ...rest } = revision;
          return rest;
        }),
      )
        .then((result) => onAcknowledge?.(result))
        .catch((error) => defaultLogger.error("ACK error", error));
    } catch (error) {
      onError(error as Error);
    }
  }

  static setupPull(
    driveId: string,
    trigger: PullResponderTrigger,
    onStrandUpdate: (
      strand: StrandUpdate,
      source: StrandUpdateSource,
    ) => Promise<IOperationResult>,
    onError: (error: Error) => void,
    onRevisions?: (revisions: ListenerRevisionWithError[]) => void,
    onAcknowledge?: (success: boolean) => void,
  ): CancelPullLoop {
    const { interval } = trigger.data;
    let loopInterval = PULL_DRIVE_INTERVAL;
    if (interval) {
      try {
        const intervalNumber = parseInt(interval);
        if (intervalNumber) {
          loopInterval = intervalNumber;
        }
      } catch {
        // ignore invalid interval
      }
    }

    let isCancelled = false;
    let timeout: number | undefined;

    const executeLoop = async () => {
      while (!isCancelled) {
        await this.executePull(
          driveId,
          trigger,
          onStrandUpdate,
          onError,
          onRevisions,
          onAcknowledge,
        );
        await new Promise((resolve) => {
          timeout = setTimeout(resolve, loopInterval) as unknown as number;
        });
      }
    };

    executeLoop().catch(defaultLogger.error);

    return () => {
      isCancelled = true;
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    };
  }

  static async createPullResponderTrigger(
    driveId: string,
    url: string,
    options: Pick<RemoteDriveOptions, "pullInterval" | "pullFilter">,
  ): Promise<PullResponderTrigger> {
    const { pullFilter, pullInterval } = options;
    const listenerId = await PullResponderTransmitter.registerPullResponder(
      driveId,
      url,
      pullFilter ?? {
        documentId: ["*"],
        documentType: ["*"],
        branch: ["*"],
        scope: ["*"],
      },
    );

    const pullTrigger: PullResponderTrigger = {
      id: generateUUID(),
      type: "PullResponder",
      data: {
        url,
        listenerId,
        interval: pullInterval?.toString() ?? "",
      },
    };
    return pullTrigger;
  }

  static isPullResponderTrigger(
    trigger: Trigger,
  ): trigger is PullResponderTrigger {
    return trigger.type === "PullResponder";
  }
}
