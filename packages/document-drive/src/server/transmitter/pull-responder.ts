import type {
  CancelPullLoop,
  GetStrandsOptions,
  GraphQLResult,
  IListenerManager,
  ILogger,
  IOperationResult,
  IPullResponderTransmitter,
  ListenerFilter,
  ListenerRevision,
  ListenerRevisionWithError,
  PullResponderTrigger,
  PullStrandsGraphQL,
  RemoteDriveOptions,
  ServerListener,
  StrandUpdate,
  StrandUpdateSource,
  Trigger,
} from "document-drive";
import { OperationError } from "document-drive/server/error";
import { requestGraphql } from "document-drive/utils/graphql";
import { childLogger } from "document-drive/utils/logger";
import { operationsToRevision } from "document-drive/utils/misc";
import { generateId } from "document-model/core";
import { gql } from "graphql-request";
import { PULL_DRIVE_INTERVAL } from "./constants.js";

const MAX_REVISIONS_PER_ACK = 100;
const MAX_PULLS = 50;

interface GraphQLError {
  message: string;
  response?: {
    errors?: Array<{
      message: string;
    }>;
  };
}

// lazily create the static logger so the logging system has time to read
// configuration values for setting log level
let _staticLogger: ILogger | undefined;
const staticLogger = () => {
  if (!_staticLogger) {
    _staticLogger = childLogger(["PullResponderTransmitter", "static"]);
  }
  return _staticLogger;
};

export class PullResponderTransmitter implements IPullResponderTransmitter {
  private logger = childLogger([
    "PullResponderTransmitter",
    Math.floor(Math.random() * 999).toString(),
  ]);

  private listener: ServerListener;
  private manager: IListenerManager;

  constructor(listener: ServerListener, manager: IListenerManager) {
    this.listener = listener;
    this.manager = manager;
    this.logger.verbose(
      "constructor(listener: @listenerId)",
      listener.listenerId,
    );
  }

  private static async getAuthHeaders(
    url: string,
    manager?: IListenerManager,
  ): Promise<Record<string, string>> {
    if (!manager?.generateJwtHandler) {
      staticLogger().verbose("No JWT handler available for @url", url);
      return {};
    }
    try {
      const jwt = await manager.generateJwtHandler(url);
      if (!jwt) {
        staticLogger().verbose("No JWT generated for @url", url);
        return {};
      }
      return { Authorization: `Bearer ${jwt}` };
    } catch (error) {
      staticLogger().error("Error generating JWT for @url: @error", url, error);
      return {};
    }
  }

  private async requestWithAuth<T>(
    url: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<GraphQLResult<T>> {
    const headers = await PullResponderTransmitter.getAuthHeaders(
      url,
      this.manager,
    );
    const result = await requestGraphql<T>(url, query, variables, headers);

    // Check for unauthorized error
    const error = result.errors?.at(0);
    if (error?.message.includes("Unauthorized")) {
      // Retry once with fresh JWT
      const freshHeaders = await PullResponderTransmitter.getAuthHeaders(
        url,
        this.manager,
      );
      return requestGraphql<T>(url, query, variables, freshHeaders);
    }

    return result;
  }

  getStrands(options?: GetStrandsOptions): Promise<StrandUpdate[]> {
    this.logger.verbose(
      "[SYNC DEBUG] PullResponderTransmitter.getStrands called for drive: @driveId, listener: @listenerId, options: @options",
      this.listener.driveId,
      this.listener.listenerId,
      options || {},
    );

    return this.manager
      .getStrands(this.listener.driveId, this.listener.listenerId, options)
      .then((strands) => {
        this.logger.verbose(
          "[SYNC DEBUG] PullResponderTransmitter.getStrands returning @count strands for drive: @driveId, listener: @listenerId",
          strands.length,
          this.listener.driveId,
          this.listener.listenerId,
        );
        if (strands.length === 0) {
          this.logger.verbose(
            "[SYNC DEBUG] No strands returned for drive: @driveId, listener: @listenerId",
            this.listener.driveId,
            this.listener.listenerId,
          );
        } else {
          for (const strand of strands) {
            this.logger.verbose(
              "[SYNC DEBUG] Strand for drive: @driveId, document: @documentId, scope: @scope, operations: @count",
              strand.driveId,
              strand.documentId,
              strand.scope,
              strand.operations.length,
            );
          }
        }
        return strands;
      });
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
      "processAcknowledge(drive: @driveId, listener: @listenerId): @revisions",
      driveId,
      listenerId,
      revisions,
    );
    let success = true;
    for (const revision of revisions) {
      try {
        await this.manager.updateListenerRevision(
          listenerId,
          driveId,
          {
            documentId: revision.documentId,
            scope: revision.scope,
            branch: revision.branch,
          },
          revision.revision,
        );
      } catch (error) {
        this.logger.warn(
          "Error acknowledging sync unit: @error, @revision",
          error,
          revision,
        );
        success = false;
        continue;
      }
    }
    return success;
  }

  static async registerPullResponder(
    driveId: string,
    url: string,
    filter: ListenerFilter,
    listenerId?: string,
    manager?: IListenerManager,
  ): Promise<ServerListener["listenerId"]> {
    staticLogger().verbose(
      "registerPullResponder(url: @url) @filter",
      url,
      filter,
    );

    const headers = await this.getAuthHeaders(url, manager);
    const result = await requestGraphql<{
      registerPullResponderListener: {
        listenerId: ServerListener["listenerId"];
      };
    }>(
      url,
      gql`
        mutation registerPullResponderListener(
          $filter: InputListenerFilter!
          $listenerId: String
        ) {
          registerPullResponderListener(
            filter: $filter
            listenerId: $listenerId
          ) {
            listenerId
          }
        }
      `,
      { filter, listenerId },
      headers,
    );

    const error = result.errors?.at(0);
    if (error) {
      if (error.message.includes("Unauthorized")) {
        // Retry once with fresh JWT
        const freshHeaders = await this.getAuthHeaders(url, manager);
        const retryResult = await requestGraphql<{
          registerPullResponderListener: {
            listenerId: ServerListener["listenerId"];
          };
        }>(
          url,
          gql`
            mutation registerPullResponderListener(
              $filter: InputListenerFilter!
              $listenerId: String
            ) {
              registerPullResponderListener(
                filter: $filter
                listenerId: $listenerId
              ) {
                listenerId
              }
            }
          `,
          { filter, listenerId },
          freshHeaders,
        );
        if (retryResult.errors?.at(0)) {
          throw retryResult.errors[0];
        }
        if (!retryResult.registerPullResponderListener) {
          throw new Error("Error registering listener");
        }
        return retryResult.registerPullResponderListener.listenerId;
      }
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
    options?: GetStrandsOptions,
    manager?: IListenerManager,
  ): Promise<StrandUpdate[]> {
    staticLogger().verbose(
      "[SYNC DEBUG] PullResponderTransmitter.pullStrands called for drive: @driveId, url: @url, listener: @listenerId, options: @options",
      driveId,
      url,
      listenerId,
      options || {},
    );

    const headers = await this.getAuthHeaders(url, manager);
    const result = await requestGraphql<PullStrandsGraphQL>(
      url,
      gql`
        query strands($listenerId: ID!) {
          system {
            sync {
              strands(listenerId: $listenerId) {
                driveId
                documentId
                documentType
                scope
                branch
                operations {
                  id
                  actionId
                  timestampUtcMs
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
      headers,
    );

    const error = result.errors?.at(0);
    if (error) {
      if (error.message.includes("Unauthorized")) {
        // Retry once with fresh JWT
        const freshHeaders = await this.getAuthHeaders(url, manager);
        const retryResult = await requestGraphql<PullStrandsGraphQL>(
          url,
          gql`
            query strands($listenerId: ID!) {
              system {
                sync {
                  strands(listenerId: $listenerId) {
                    driveId
                    documentId
                    documentType
                    scope
                    branch
                    operations {
                      id
                      actionId
                      timestampUtcMs
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
          freshHeaders,
        );
        if (retryResult.errors?.at(0)) {
          throw retryResult.errors[0];
        }
        if (!retryResult.system) {
          return [];
        }
        return retryResult.system.sync.strands.map((s) => ({
          ...s,
          operations: s.operations.map((o) => ({
            ...o,
            input: JSON.parse(o.input) as object,
          })),
        }));
      }
      throw error;
    }

    if (!result.system) {
      staticLogger().verbose(
        "[SYNC DEBUG] No system data returned when pulling strands for drive: @driveId, listener: @listenerId",
        driveId,
        listenerId,
      );
      return [];
    }

    const strands = result.system.sync.strands.map((s) => ({
      ...s,
      operations: s.operations.map((o) => ({
        ...o,
        input: JSON.parse(o.input) as object,
      })),
    }));

    staticLogger().verbose(
      "[SYNC DEBUG] PullResponderTransmitter.pullStrands returning @count strands for drive: @driveId, listener: @listenerId",
      strands.length,
      driveId,
      listenerId,
    );

    if (strands.length > 0) {
      staticLogger().verbose(
        "[SYNC DEBUG] Strands being returned: @strandIds",
        strands.map((s) => `${s.documentId}:${s.scope}`).join(", "),
      );
    }

    return strands;
  }

  static async acknowledgeStrands(
    url: string,
    listenerId: string,
    revisions: ListenerRevision[],
    manager?: IListenerManager,
  ): Promise<void> {
    staticLogger().verbose(
      "acknowledgeStrands(url: @url, listener: @listenerId) @revisions",
      url,
      listenerId,
      revisions,
    );

    // split revisions into chunks
    const chunks = [];
    for (let i = 0; i < revisions.length; i += MAX_REVISIONS_PER_ACK) {
      chunks.push(revisions.slice(i, i + MAX_REVISIONS_PER_ACK));
    }

    if (chunks.length > 1) {
      staticLogger().verbose(
        "Breaking strand acknowledgement into @count chunks...",
        chunks.length,
      );
    }

    const headers = await this.getAuthHeaders(url, manager);
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
          headers,
        );

        const error = result.errors?.at(0);
        if (error) {
          if (error.message.includes("Unauthorized")) {
            // Retry once with fresh JWT
            const freshHeaders = await this.getAuthHeaders(url, manager);
            const retryResult = await requestGraphql<{ acknowledge: boolean }>(
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
              freshHeaders,
            );
            if (retryResult.errors?.at(0)) {
              throw retryResult.errors[0];
            }
            if (retryResult.acknowledge === null || !retryResult.acknowledge) {
              throw new Error("Error acknowledging strands");
            }
            return;
          }
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

  /**
   * This function will only throw if `onError` throws an error (or there is
   * an unintentionally unhandled error in the pull loop).
   *
   * All other errors are caught, logged, and passed to `onError`.
   *
   * Because of this, `onError` _may be called multiple times_.
   *
   * @returns boolean indicating whether there might be more data to pull
   */
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
    manager?: IListenerManager,
  ): Promise<boolean> {
    staticLogger().verbose(
      "executePull(driveId: @driveId), trigger: @trigger",
      driveId,
      trigger,
    );

    staticLogger().verbose(
      "[SYNC DEBUG] PullResponderTransmitter.executePull starting for drive: @driveId, listenerId: @listenerId",
      driveId,
      trigger.data.listenerId,
    );

    const { url } = trigger.data;

    let strands: StrandUpdate[] | undefined;
    let error: Error | undefined;
    const listenerId = trigger.data.listenerId;
    try {
      strands = await PullResponderTransmitter.pullStrands(
        driveId,
        url,
        listenerId,
        undefined,
        manager,
      );
    } catch (e) {
      error = e as Error;

      const graphqlError = error as GraphQLError;
      const errors = graphqlError.response?.errors ?? [];

      for (const err of errors) {
        if (err.message === "Listener not found") {
          staticLogger().verbose(
            "[SYNC DEBUG] Auto-registering pull responder for drive: @driveId",
            driveId,
          );

          // register a new pull responder with this id
          await PullResponderTransmitter.registerPullResponder(
            trigger.driveId,
            url,
            trigger.filter,
            listenerId,
          );

          // try again
          try {
            strands = await PullResponderTransmitter.pullStrands(
              driveId,
              url,
              listenerId,
              undefined,
              manager,
            );

            staticLogger().verbose(
              "Successfully auto-registered and pulled strands for drive: @driveId, listenerId: @listenerId",
              driveId,
              listenerId,
            );
          } catch (error) {
            staticLogger().error(
              "Could not resolve 'Listener not found' error by registering a new pull responder for drive: @driveId, listenerId: @listenerId: @error",
              driveId,
              listenerId,
              error,
            );

            onError(error as Error);
            return false;
          }

          break;
        }
      }
    }

    if (!strands) {
      staticLogger().error(
        "Error pulling strands for drive, and could not auto-register: @driveId, listenerId: @listenerId: @error",
        driveId,
        trigger.data.listenerId,
        error,
      );

      onError(error!);
      return false;
    }

    // if there are no new strands then do nothing
    if (!strands.length) {
      staticLogger().verbose(
        "[SYNC DEBUG] No strands returned in pull cycle for drive: @driveId, listenerId: @listenerId",
        driveId,
        trigger.data.listenerId,
      );

      try {
        onRevisions?.([]);
      } catch (error) {
        staticLogger().error(
          "Error calling onRevisions for drive: @driveId, listenerId: @listenerId: @error",
          driveId,
          trigger.data.listenerId,
          error,
        );

        // pass the error to the caller
        onError(error as Error);
      }

      return false;
    }

    staticLogger().verbose(
      "[SYNC DEBUG] Processing @count strands in pull cycle for drive: @driveId, listenerId: @listenerId",
      strands.length,
      driveId,
      trigger.data.listenerId,
    );

    const listenerRevisions: ListenerRevisionWithError[] = [];

    // todo: evaluate whether or not we can process strands in parallel
    for (const strand of strands) {
      const operations = strand.operations.map((op) => ({
        ...op,
        scope: strand.scope,
        branch: strand.branch,
      }));

      staticLogger().verbose(
        "[SYNC DEBUG] Processing strand for drive: @driveId, document: @documentId, scope: @scope, with @count operations",
        strand.driveId,
        strand.documentId,
        strand.scope,
        operations.length,
      );

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
        staticLogger().error(
          "Error processing strand for drive: @driveId, document: @documentId, scope: @scope, with @count operations: @error",
          strand.driveId,
          strand.documentId,
          strand.scope,
          operations.length,
          e,
        );

        error = e as Error;
        onError(error);

        // continue
      }

      listenerRevisions.push({
        branch: strand.branch,
        documentId: strand.documentId || "",
        documentType: strand.documentType,
        driveId: strand.driveId,
        revision: operationsToRevision(operations),
        scope: strand.scope,
        status: error
          ? error instanceof OperationError
            ? error.status
            : "ERROR"
          : "SUCCESS",
        error,
      });
    }

    staticLogger().verbose("Processed strands...");

    // do not let a listener kill the pull loop
    try {
      onRevisions?.(listenerRevisions);
    } catch (error) {
      staticLogger().error(
        "Error calling onRevisions for drive: @driveId, listenerId: @listenerId: @error",
        driveId,
        trigger.data.listenerId,
        error,
      );

      // pass the error to the caller
      onError(error as Error);
    }

    staticLogger().verbose(
      "[SYNC DEBUG] Acknowledging @count strands for drive: @driveId, listenerId: @listenerId",
      listenerRevisions.length,
      driveId,
      trigger.data.listenerId,
    );

    let success = false;
    try {
      await PullResponderTransmitter.acknowledgeStrands(
        url,
        trigger.data.listenerId,
        listenerRevisions.map((revision) => {
          const { error, ...rest } = revision;
          return rest;
        }),
        manager,
      );

      success = true;
    } catch (error) {
      staticLogger().error(
        "Error acknowledging strands for drive: @driveId, listenerId: @listenerId: @error",
        driveId,
        trigger.data.listenerId,
        error,
      );

      // pass the error to the caller
      onError(error as Error);
    }

    if (success) {
      staticLogger().verbose(
        "[SYNC DEBUG] Successfully acknowledged strands for drive: @driveId, listenerId: @listenerId",
        driveId,
        trigger.data.listenerId,
      );
    } else {
      staticLogger().error("Failed to acknowledge strands");
    }

    // let this throw separately
    try {
      onAcknowledge?.(success);
    } catch (error) {
      staticLogger().error(
        "Error calling onAcknowledge for drive: @driveId, listenerId: @listenerId: @error",
        driveId,
        trigger.data.listenerId,
        error,
      );

      // pass the error to the caller
      onError(error as Error);
    }

    // Return true if we received strands, indicating there might be more to pull
    return strands.length > 0;
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
    manager?: IListenerManager,
  ): CancelPullLoop {
    staticLogger().verbose(
      "[SYNC DEBUG] PullResponderTransmitter.setupPull initiated for drive: @driveId, listenerId: @listenerId",
      driveId,
      trigger.data.listenerId,
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

    staticLogger().verbose(
      "[SYNC DEBUG] Pull interval set to @loopIntervalms for drive: @driveId, listenerId: @listenerId",
      loopInterval,
      driveId,
      trigger.data.listenerId,
    );

    let isCancelled = false;
    let timeout: number | undefined;

    const executeLoop = async () => {
      while (!isCancelled) {
        staticLogger().verbose(
          "[SYNC DEBUG] Starting pull cycle for drive: @driveId, listenerId: @listenerId",
          driveId,
          trigger.data.listenerId,
        );

        // keep pulling until we get no more strands, encounter an error, or hit the limit
        let counter = 0;
        let hasMore = true;
        while (hasMore && !isCancelled && counter < MAX_PULLS) {
          counter++;

          hasMore = await this.executePull(
            driveId,
            trigger,
            onStrandUpdate,
            onError,
            onRevisions,
            onAcknowledge,
            manager,
          );

          if (hasMore) {
            staticLogger().verbose(
              "[SYNC DEBUG] More strands available, continuing pull cycle for drive: @driveId, listenerId: @listenerId",
              driveId,
              trigger.data.listenerId,
            );
          }
        }

        staticLogger().verbose(
          "[SYNC DEBUG] Completed pull cycle for drive: @driveId, listenerId: @listenerId, waiting @loopIntervalms for next cycle",
          driveId,
          trigger.data.listenerId,
          loopInterval,
        );

        await new Promise((resolve) => {
          staticLogger().verbose(
            "Scheduling next pull in @loopInterval ms",
            loopInterval,
          );
          timeout = setTimeout(resolve, loopInterval) as unknown as number;
        });
      }
    };

    executeLoop().catch((error) => {
      staticLogger().error(
        "Error in executeLoop for drive: @driveId, listenerId: @listenerId: @error",
        driveId,
        trigger.data.listenerId,
        error,
      );
    });

    return () => {
      staticLogger().verbose(
        "[SYNC DEBUG] Cancelling pull loop for drive: @driveId, listenerId: @listenerId",
        driveId,
        trigger.data.listenerId,
      );
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
    listenerManager: IListenerManager,
  ): Promise<PullResponderTrigger> {
    staticLogger().verbose(
      "createPullResponderTrigger(drive: @driveId, url: @url)",
      driveId,
      url,
    );

    const { pullFilter, pullInterval } = options;
    const filter = pullFilter ?? {
      documentId: ["*"],
      documentType: ["*"],
      branch: ["*"],
      scope: ["*"],
    };

    const listenerId = await PullResponderTransmitter.registerPullResponder(
      driveId,
      url,
      filter,
      undefined,
      listenerManager,
    );

    const pullTrigger: PullResponderTrigger = {
      id: generateId(),
      type: "PullResponder",
      driveId,
      filter,
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
