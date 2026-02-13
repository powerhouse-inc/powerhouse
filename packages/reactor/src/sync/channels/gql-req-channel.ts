import type { IOperationIndex } from "../../cache/operation-index-types.js";
import type { ILogger } from "../../logging/types.js";
import type { ISyncCursorStorage } from "../../storage/interfaces.js";
import { BufferedMailbox } from "../buffered-mailbox.js";
import { ChannelError } from "../errors.js";
import type { IChannel } from "../interfaces.js";
import { type IMailbox, Mailbox } from "../mailbox.js";
import type { SyncOperation } from "../sync-operation.js";
import type { JwtHandler, RemoteFilter, SyncEnvelope } from "../types.js";
import { ChannelErrorSource } from "../types.js";
import {
  sortEnvelopesByFirstOperationTimestamp,
  trimMailboxFromAckOrdinal,
} from "../utils.js";
import type { IPollTimer } from "./poll-timer.js";
import {
  envelopesToSyncOperations,
  getLatestAppliedOrdinal,
  serializeEnvelope,
} from "./utils.js";

/**
 * Configuration parameters for GqlChannel
 */
export type GqlChannelConfig = {
  /** The GraphQL endpoint URL */
  url: string;
  /** Dynamic JWT token handler for generating fresh tokens per-request */
  jwtHandler?: JwtHandler;
  /** Base delay for exponential backoff retries in milliseconds (default: 1000) */
  retryBaseDelayMs?: number;
  /** Maximum delay for exponential backoff retries in milliseconds (default: 300000) */
  retryMaxDelayMs?: number;
  /** Maximum number of consecutive failures before marking as error (default: 5) */
  maxFailures?: number;
  /** Custom fetch function for testing (default: global fetch) */
  fetchFn?: typeof fetch;
  /** Collection ID to synchronize */
  collectionId: string;
  /** Filter to apply to operations */
  filter: RemoteFilter;
};

/**
 * GraphQL-based synchronization channel for network communication between reactors.
 */
export class GqlRequestChannel implements IChannel {
  readonly inbox: IMailbox;
  readonly outbox: IMailbox;
  readonly deadLetter: IMailbox;
  readonly config: GqlChannelConfig;
  private readonly bufferedOutbox: BufferedMailbox;

  private readonly channelId: string;
  private readonly remoteName: string;
  private readonly cursorStorage: ISyncCursorStorage;
  private readonly operationIndex: IOperationIndex;
  private readonly pollTimer: IPollTimer;
  private isShutdown: boolean;
  private failureCount: number;
  private lastSuccessUtcMs?: number;
  private lastFailureUtcMs?: number;

  constructor(
    private readonly logger: ILogger,
    channelId: string,
    remoteName: string,
    cursorStorage: ISyncCursorStorage,
    config: GqlChannelConfig,
    operationIndex: IOperationIndex,
    pollTimer: IPollTimer,
  ) {
    this.channelId = channelId;
    this.remoteName = remoteName;
    this.cursorStorage = cursorStorage;
    this.operationIndex = operationIndex;
    this.pollTimer = pollTimer;
    this.config = {
      url: config.url,
      jwtHandler: config.jwtHandler,
      retryBaseDelayMs: config.retryBaseDelayMs ?? 1000,
      retryMaxDelayMs: config.retryMaxDelayMs ?? 300000,
      maxFailures: config.maxFailures ?? 5,
      fetchFn: config.fetchFn,
      collectionId: config.collectionId,
      filter: config.filter,
    };
    this.isShutdown = false;
    this.failureCount = 0;

    this.inbox = new Mailbox();
    this.bufferedOutbox = new BufferedMailbox(500, 25);
    this.outbox = this.bufferedOutbox;
    this.deadLetter = new Mailbox();

    // when sync ops are added to the outbox, push them to the remote
    this.outbox.onAdded((syncOps) => {
      if (this.isShutdown) {
        return;
      }

      this.pushSyncOperations(syncOps).catch((error) => {
        const err = error instanceof Error ? error : new Error(String(error));
        const channelError = new ChannelError(ChannelErrorSource.Outbox, err);
        for (const syncOp of syncOps) {
          syncOp.failed(channelError);
        }

        // move to dead letters
        this.deadLetter.add(...syncOps);
        this.outbox.remove(...syncOps);
      });
    });

    this.outbox.onRemoved((syncOps) => {
      const maxOrdinal = getLatestAppliedOrdinal(syncOps);
      if (maxOrdinal > this.outbox.ackOrdinal) {
        this.cursorStorage
          .upsert({
            remoteName: this.remoteName,
            cursorType: "outbox",
            cursorOrdinal: maxOrdinal,
            lastSyncedAtUtcMs: Date.now(),
          })
          .catch((error) => {
            this.logger.error(
              "Failed to update outbox cursor for @ChannelId! This means that future application runs may resend duplicate operations. This is recoverable (with deduplication protection), but not-optimal: @Error",
              this.channelId,
              error,
            );
          });
      }
    });

    this.inbox.onRemoved((syncOps) => {
      const maxOrdinal = getLatestAppliedOrdinal(syncOps);
      if (maxOrdinal > this.inbox.ackOrdinal) {
        this.cursorStorage
          .upsert({
            remoteName: this.remoteName,
            cursorType: "inbox",
            cursorOrdinal: maxOrdinal,
            lastSyncedAtUtcMs: Date.now(),
          })
          .catch((error) => {
            this.logger.error(
              "Failed to update inbox cursor for @ChannelId! This is unlikely to cause a problem, but not-optimal: @Error",
              this.channelId,
              error,
            );
          });
      }
    });
  }

  /**
   * Shuts down the channel and prevents further operations.
   */
  shutdown(): Promise<void> {
    this.bufferedOutbox.flush();
    this.isShutdown = true;
    this.pollTimer.stop();

    return Promise.resolve();
  }

  /**
   * Initializes the channel by registering it on the remote server and starting polling.
   */
  async init(): Promise<void> {
    await this.touchRemoteChannel();

    // get cursors -- these are the last acknowledged ordinals for the inbox and outbox
    const cursors = await this.cursorStorage.list(this.remoteName);
    this.inbox.init(
      cursors.find((c) => c.cursorType === "inbox")?.cursorOrdinal ?? 0,
    );
    this.outbox.init(
      cursors.find((c) => c.cursorType === "outbox")?.cursorOrdinal ?? 0,
    );

    this.pollTimer.setDelegate(() => this.poll());
    this.pollTimer.start();
  }

  /**
   * Polls the remote for new sync envelopes.
   */
  private async poll(): Promise<void> {
    if (this.isShutdown) {
      return;
    }

    if (this.failureCount >= this.config.maxFailures!) {
      return;
    }

    let response;
    try {
      response = await this.pollSyncEnvelopes(
        this.inbox.ackOrdinal,
        this.inbox.latestOrdinal,
      );
    } catch (error) {
      this.handlePollError(error);
      return;
    }

    const { envelopes, ackOrdinal } = response;

    // first: trim outbox
    if (ackOrdinal > 0) {
      trimMailboxFromAckOrdinal(this.outbox, ackOrdinal);
    }

    // todo: Is this necessary? Outbox items should have been sorted when returned.
    const sortedEnvelopes = sortEnvelopesByFirstOperationTimestamp(envelopes);

    // convert the envelopes to sync operations
    const allSyncOps: SyncOperation[] = [];
    for (const envelope of sortedEnvelopes) {
      if (envelope.type === "operations" && envelope.operations) {
        const syncOps = envelopesToSyncOperations(envelope, this.remoteName);
        for (const syncOp of syncOps) {
          syncOp.transported();
        }
        allSyncOps.push(...syncOps);
      }
    }

    // add all of them to the inbox
    if (allSyncOps.length > 0) {
      this.inbox.add(...allSyncOps);
    }

    this.lastSuccessUtcMs = Date.now();
    this.failureCount = 0;
  }

  /**
   * Handles polling errors with exponential backoff.
   */
  private handlePollError(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));

    if (err.message.includes("Channel not found")) {
      this.recoverFromChannelNotFound();
      return;
    }

    this.failureCount++;
    this.lastFailureUtcMs = Date.now();

    const channelError = new ChannelError(ChannelErrorSource.Inbox, err);

    this.logger.error(
      "GqlChannel poll error (@FailureCount/@MaxFailures): @Error",
      this.failureCount,
      this.config.maxFailures,
      channelError,
    );

    if (this.failureCount >= this.config.maxFailures!) {
      this.logger.error(
        "GqlChannel @ChannelId exceeded failure threshold, stopping polls",
        this.channelId,
      );
    }
  }

  /**
   * Recovers from a "Channel not found" error by re-registering and restarting polling.
   */
  private recoverFromChannelNotFound(): void {
    this.logger.info(
      "GqlChannel @ChannelId not found on remote, re-registering...",
      this.channelId,
    );

    this.pollTimer.stop();

    void this.touchRemoteChannel()
      .then(() => {
        this.logger.info(
          "GqlChannel @ChannelId re-registered successfully",
          this.channelId,
        );
        this.failureCount = 0;
        this.pollTimer.start();
      })
      .catch((recoveryError: unknown) => {
        this.logger.error(
          "GqlChannel @ChannelId failed to re-register: @Error",
          this.channelId,
          recoveryError,
        );
        this.failureCount++;
        this.lastFailureUtcMs = Date.now();
        this.pollTimer.start();
      });
  }

  /**
   * Queries the remote GraphQL endpoint for sync envelopes.
   */
  private async pollSyncEnvelopes(
    ackOrdinal: number,
    latestOrdinal: number,
  ): Promise<{
    envelopes: SyncEnvelope[];
    ackOrdinal: number;
  }> {
    const query = `
      query PollSyncEnvelopes($channelId: String!, $cursorOrdinal: Int!) {
        pollSyncEnvelopes(channelId: $channelId, cursorOrdinal: $cursorOrdinal) {
          type
          channelMeta {
            id
          }
          operations {
            operation {
              index
              timestampUtcMs
              hash
              skip
              error
              id
              action {
                id
                type
                timestampUtcMs
                input
                scope
                attachments {
                  data
                  mimeType
                  hash
                  extension
                  fileName
                }
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
            context {
              documentId
              documentType
              scope
              branch
            }
          }
          cursor {
            remoteName
            cursorOrdinal
            lastSyncedAtUtcMs
          }
          key
          dependsOn
        }
      }
    `;

    const variables = {
      channelId: this.channelId,
      outboxAck: ackOrdinal,
      outboxLatest: latestOrdinal,
    };

    const response = await this.executeGraphQL<{
      pollSyncEnvelopes: SyncEnvelope[];
      ackOrdinal: number;
    }>(query, variables);

    return {
      envelopes: response.pollSyncEnvelopes,
      ackOrdinal: response.ackOrdinal,
    };
  }

  /**
   * Registers or updates this channel on the remote server via GraphQL mutation.
   */
  private async touchRemoteChannel(): Promise<void> {
    let sinceTimestampUtcMs = "0";
    try {
      const result = await this.operationIndex.getLatestTimestampForCollection(
        this.config.collectionId,
      );
      if (result) {
        sinceTimestampUtcMs = result;
      }
    } catch {
      // If query fails, use default "0" (sends all operations)
    }

    const mutation = `
      mutation TouchChannel($input: TouchChannelInput!) {
        touchChannel(input: $input)
      }
    `;

    const variables = {
      input: {
        id: this.channelId,
        name: this.channelId,
        collectionId: this.config.collectionId,
        filter: {
          documentId: this.config.filter.documentId,
          scope: this.config.filter.scope,
          branch: this.config.filter.branch,
        },
        sinceTimestampUtcMs,
      },
    };

    await this.executeGraphQL<{ touchChannel: boolean }>(mutation, variables);
  }

  /**
   * Pushes multiple sync operations to the remote via a single GraphQL mutation.
   * Creates one SyncEnvelope per SyncOperation with key/dependsOn for batch ordering.
   */
  private async pushSyncOperations(syncOps: SyncOperation[]): Promise<void> {
    for (const syncOp of syncOps) {
      syncOp.started();
    }

    const jobIdToKeys = new Map<string, string[]>();
    const envelopes: SyncEnvelope[] = [];

    for (let i = 0; i < syncOps.length; i++) {
      const syncOp = syncOps[i];
      const key = String(i);

      if (syncOp.jobId) {
        if (!jobIdToKeys.has(syncOp.jobId)) {
          jobIdToKeys.set(syncOp.jobId, []);
        }
        jobIdToKeys.get(syncOp.jobId)!.push(key);
      }

      const dependsOn: string[] = [];
      for (const dep of syncOp.jobDependencies) {
        const depKeys = jobIdToKeys.get(dep);
        if (depKeys) {
          dependsOn.push(...depKeys);
        }
      }

      this.logger.debug(
        "[PUSH]: @Operations",
        syncOp.operations.map(
          (op) =>
            `(${op.context.documentId}, ${op.context.branch}, ${op.context.scope}, ${op.operation.index})`,
        ),
      );

      envelopes.push({
        type: "operations",
        channelMeta: { id: this.channelId },
        operations: syncOp.operations,
        key,
        dependsOn,
      });
    }

    const mutation = `
      mutation PushSyncEnvelopes($envelopes: [SyncEnvelopeInput!]!) {
        pushSyncEnvelopes(envelopes: $envelopes)
      }
    `;

    const variables = {
      envelopes: envelopes.map((e) => serializeEnvelope(e)),
    };

    await this.executeGraphQL<{ pushSyncEnvelopes: boolean }>(
      mutation,
      variables,
    );
  }

  /**
   * Gets the authorization header value using jwtHandler.
   */
  private async getAuthorizationHeader(): Promise<string | undefined> {
    if (!this.config.jwtHandler) {
      return undefined;
    }

    try {
      const token = await this.config.jwtHandler(this.config.url);
      if (token) {
        return `Bearer ${token}`;
      }
    } catch (error) {
      this.logger.error("JWT handler failed: @Error", error);
    }
    return undefined;
  }

  /**
   * Executes a GraphQL query or mutation against the remote endpoint.
   */
  private async executeGraphQL<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const authHeader = await this.getAuthorizationHeader();
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    const fetchFn = this.config.fetchFn ?? fetch;
    let response;
    try {
      response = await fetchFn(this.config.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query,
          variables,
        }),
      });
    } catch (error) {
      throw new Error(
        `GraphQL request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `GraphQL request failed: ${response.status} ${response.statusText}`,
      );
    }

    let result;
    try {
      result = (await response.json()) as {
        data?: T;
        errors?: Array<{ message: string }>;
      };
    } catch (error) {
      throw new Error(
        `Failed to parse GraphQL response: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (result.errors) {
      throw new Error(
        `GraphQL errors: ${JSON.stringify(result.errors, null, 2)}`,
      );
    }

    if (!result.data) {
      throw new Error("GraphQL response missing data field");
    }

    return result.data;
  }

  /**
   * Gets the current health status of the channel.
   */
  getHealth(): {
    state: "idle" | "running" | "error";
    lastSuccessUtcMs?: number;
    lastFailureUtcMs?: number;
    failureCount: number;
  } {
    return {
      state:
        this.failureCount >= this.config.maxFailures!
          ? "error"
          : this.failureCount > 0
            ? "running"
            : "idle",
      lastSuccessUtcMs: this.lastSuccessUtcMs,
      lastFailureUtcMs: this.lastFailureUtcMs,
      failureCount: this.failureCount,
    };
  }

  get poller(): IPollTimer {
    return this.pollTimer;
  }
}
