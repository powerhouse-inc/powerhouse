import {
  type GetStrandsOptions,
  type IListenerManager,
  type IOperationResult,
  type Listener,
  type ListenerRevision,
  type ListenerRevisionWithError,
  type OperationUpdate,
  type RemoteDriveOptions,
  type StrandUpdate,
} from "#server/types";

import {
  type ListenerFilter,
  type Trigger,
} from "#drive-document-model/gen/types";
import { PULL_DRIVE_INTERVAL } from "#server/constants";
import { OperationError } from "#server/error";
import { requestGraphql } from "#utils/graphql";
import { childLogger } from "#utils/logger";
import { generateUUID } from "#utils/misc";
import { gql } from "graphql-request";
import {
  type ITransmitter,
  type PullResponderTrigger,
  type StrandUpdateSource,
} from "./types.js";

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

const MAX_REVISIONS_PER_ACK = 100;

export class PullResponderTransmitter implements IPullResponderTransmitter {
  private static staticLogger = childLogger([
    "PullResponderTransmitter",
    "static",
  ]);

  private logger = childLogger([
    "PullResponderTransmitter",
    Math.floor(Math.random() * 999).toString(),
  ]);

  private listener: Listener;
  private manager: IListenerManager;

  constructor(listener: Listener, manager: IListenerManager) {
    this.listener = listener;
    this.manager = manager;
    this.logger.verbose(`constructor(listener: ${listener.listenerId})`);
  }

  getStrands(options?: GetStrandsOptions): Promise<StrandUpdate[]> {
    this.logger.verbose(
      `getStrands(drive: ${this.listener.driveId}, listener: ${this.listener.listenerId})`,
    );

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
    this.logger.verbose(
      `processAcknowledge(drive: ${driveId}, listener: ${listenerId})`,
      revisions,
    );

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
          s.documentId == revision.documentId,
      );
      if (!syncUnit) {
        this.logger.warn("Unknown sync unit was acknowledged", revision);
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
    PullResponderTransmitter.staticLogger.verbose(
      `registerPullResponder(url: ${url})`,
      filter,
    );

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
    this.staticLogger.verbose(
      `pullStrands(url: ${url}, listener: ${listenerId})`,
    );

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
    url: string,
    listenerId: string,
    revisions: ListenerRevision[],
  ): Promise<void> {
    this.staticLogger.verbose(
      `acknowledgeStrands(url: ${url}, listener: ${listenerId})`,
      revisions,
    );

    // split revisions into chunks
    const chunks = [];
    for (let i = 0; i < revisions.length; i += MAX_REVISIONS_PER_ACK) {
      chunks.push(revisions.slice(i, i + MAX_REVISIONS_PER_ACK));
    }

    if (chunks.length > 1) {
      this.staticLogger.verbose(
        `Breaking strand acknowledgement into ${chunks.length} chunks...`,
      );
    }

    // order does not matter, we can send out requests in parallel
    const results = await Promise.allSettled(
      chunks.map(async (chunk) => {
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
          { listenerId, revisions: chunk },
        );

        const error = result.errors?.at(0);
        if (error) {
          throw error;
        }

        if (result.acknowledge === null || !result.acknowledge) {
          throw new Error("Error acknowledging strands");
        }
      }),
    );

    // throw after we try all chunks
    const errors = results.filter((result) => result.status === "rejected");
    if (errors.length > 0) {
      throw new Error("Error acknowledging strands");
    }
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
    this.staticLogger.verbose(
      `executePull(driveId: ${driveId}), trigger:`,
      trigger,
    );

    try {
      const { url, listenerId } = trigger.data;
      const strands = await PullResponderTransmitter.pullStrands(
        driveId,
        url,
        listenerId,
        // since ?
      );

      this.staticLogger.verbose("Pulled strands...");

      // if there are no new strands then do nothing
      if (!strands.length) {
        onRevisions?.([]);

        this.staticLogger.verbose("No new strands, skipping...");
        return;
      }

      const listenerRevisions: ListenerRevisionWithError[] = [];

      for (const strand of strands) {
        const operations = strand.operations.map((op) => ({
          ...op,
          scope: strand.scope,
          branch: strand.branch,
        }));

        this.staticLogger.verbose("Processing strand...");

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

      this.staticLogger.verbose("Processed strands...");

      onRevisions?.(listenerRevisions);

      this.staticLogger.verbose("Acknowledging strands...");

      let success = false;
      try {
        await PullResponderTransmitter.acknowledgeStrands(
          url,
          listenerId,
          listenerRevisions.map((revision) => {
            const { error, ...rest } = revision;
            return rest;
          }),
        );

        success = true;
      } catch (error) {
        this.staticLogger.error("ACK error", error);
      }

      if (success) {
        this.staticLogger.verbose("Acknowledged strands successfully.");
      } else {
        this.staticLogger.error("Failed to acknowledge strands");
      }

      // let this throw separately
      onAcknowledge?.(success);
    } catch (error) {
      this.staticLogger.error("Pull error", error);

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
    this.staticLogger.verbose(
      `setupPull(drive: ${driveId}), trigger:`,
      trigger,
    );

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
        this.staticLogger.verbose("Execute loop...");
        await this.executePull(
          driveId,
          trigger,
          onStrandUpdate,
          onError,
          onRevisions,
          onAcknowledge,
        );
        await new Promise((resolve) => {
          this.staticLogger.verbose(
            `Scheduling next pull in ${loopInterval} ms`,
          );
          timeout = setTimeout(resolve, loopInterval) as unknown as number;
        });
      }
    };

    executeLoop().catch(this.staticLogger.error);

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
    this.staticLogger.verbose(
      `createPullResponderTrigger(drive: ${driveId}, url: ${url})`,
    );

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
