import type { Action, Signature } from "document-model";
import type { IOperationIndex } from "../../cache/operation-index-types.js";
import type { ILogger } from "../../logging/types.js";
import type { ISyncCursorStorage } from "../../storage/interfaces.js";
import { BufferedMailbox } from "../buffered-mailbox.js";
import { ChannelError } from "../errors.js";
import type { IChannel } from "../interfaces.js";
import { type IMailbox, Mailbox } from "../mailbox.js";
import type { SyncOperation } from "../sync-operation.js";
import type {
  JwtHandler,
  RemoteCursor,
  RemoteFilter,
  SyncEnvelope,
} from "../types.js";
import { ChannelErrorSource } from "../types.js";
import { sortEnvelopesByFirstOperationTimestamp } from "../utils.js";
import type { IPollTimer } from "./poll-timer.js";
import { envelopesToSyncOperations } from "./utils.js";

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
export class GqlChannel implements IChannel {
  readonly inbox: IMailbox<SyncOperation>;
  readonly outbox: IMailbox<SyncOperation>;
  readonly deadLetter: IMailbox<SyncOperation>;
  readonly config: GqlChannelConfig;
  private readonly bufferedOutbox: BufferedMailbox<SyncOperation>;

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

    this.inbox = new Mailbox<SyncOperation>();
    this.bufferedOutbox = new BufferedMailbox<SyncOperation>(500, 25);
    this.outbox = this.bufferedOutbox;
    this.deadLetter = new Mailbox<SyncOperation>();

    this.outbox.onAdded((syncOps) => {
      this.handleOutboxAdded(syncOps);
    });
  }

  /**
   * Shuts down the channel and prevents further operations.
   */
  shutdown(): void {
    this.bufferedOutbox.flush();
    this.isShutdown = true;
    this.pollTimer.stop();
  }

  /**
   * Initializes the channel by registering it on the remote server and starting polling.
   */
  async init(): Promise<void> {
    await this.touchRemoteChannel();
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

    let cursor;
    try {
      cursor = await this.cursorStorage.get(this.remoteName);
    } catch (error) {
      this.handlePollError(error);
      return;
    }

    const cursorOrdinal = cursor.cursorOrdinal;

    let envelopes;
    try {
      envelopes = await this.pollSyncEnvelopes(cursorOrdinal);
    } catch (error) {
      this.handlePollError(error);
      return;
    }

    let maxCursorOrdinal = cursorOrdinal;

    const sortedEnvelopes = sortEnvelopesByFirstOperationTimestamp(envelopes);
    for (const envelope of sortedEnvelopes) {
      if (envelope.type.toLowerCase() === "operations" && envelope.operations) {
        const syncOps = envelopesToSyncOperations(envelope, this.remoteName);
        for (const syncOp of syncOps) {
          syncOp.transported();
          this.inbox.add(syncOp);
        }
      }

      if (envelope.cursor && envelope.cursor.cursorOrdinal > maxCursorOrdinal) {
        maxCursorOrdinal = envelope.cursor.cursorOrdinal;
      }
    }

    if (maxCursorOrdinal > cursorOrdinal) {
      try {
        await this.updateCursor(maxCursorOrdinal);
      } catch (error) {
        this.handlePollError(error);
        return;
      }
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
    cursorOrdinal: number,
  ): Promise<SyncEnvelope[]> {
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
        }
      }
    `;

    const variables = {
      channelId: this.channelId,
      cursorOrdinal,
    };

    const response = await this.executeGraphQL<{
      pollSyncEnvelopes: SyncEnvelope[];
    }>(query, variables);

    return response.pollSyncEnvelopes;
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
   * Handles sync operations added to the outbox by sending them to the remote.
   */
  private handleOutboxAdded(syncOps: SyncOperation[]): void {
    if (this.isShutdown) {
      return;
    }

    // Execute async but don't await (fire and forget with error handling)
    this.pushSyncOperations(syncOps).catch((error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      const channelError = new ChannelError(ChannelErrorSource.Outbox, err);
      for (const syncOp of syncOps) {
        syncOp.failed(channelError);
        this.deadLetter.add(syncOp);
        this.outbox.remove(syncOp);
      }
    });
  }

  /**
   * Pushes multiple sync operations to the remote via a single GraphQL mutation.
   * Merges all operations from multiple SyncOperations into one SyncEnvelope.
   */
  private async pushSyncOperations(syncOps: SyncOperation[]): Promise<void> {
    for (const syncOp of syncOps) {
      syncOp.started();
    }

    const allOperations = syncOps.flatMap((syncOp) => syncOp.operations);

    this.logger.debug(
      "[PUSH]: @Operations",
      allOperations.map(
        (op) =>
          `(${op.context.documentId}, ${op.context.branch}, ${op.context.scope}, ${op.operation.index})`,
      ),
    );

    const envelope: SyncEnvelope = {
      type: "operations",
      channelMeta: { id: this.channelId },
      operations: allOperations,
    };

    const mutation = `
      mutation PushSyncEnvelopes($envelopes: [SyncEnvelopeInput!]!) {
        pushSyncEnvelopes(envelopes: $envelopes)
      }
    `;

    const variables = {
      envelopes: [this.serializeEnvelope(envelope)],
    };

    await this.executeGraphQL<{ pushSyncEnvelopes: boolean }>(
      mutation,
      variables,
    );

    // Successfully sent - the outbox will be cleared when we receive ACK
    // For now, we optimistically remove from outbox
    for (const syncOp of syncOps) {
      this.outbox.remove(syncOp);
    }
  }

  /**
   * Serializes a SyncEnvelope for GraphQL transport.
   *
   * Signatures are serialized as comma-separated strings since GraphQL schema
   * defines them as [String!]!. Extra context fields (resultingState, ordinal)
   * are stripped since they are not defined in OperationContextInput.
   */
  private serializeEnvelope(envelope: SyncEnvelope): unknown {
    return {
      type: envelope.type.toUpperCase(),
      channelMeta: envelope.channelMeta,
      operations: envelope.operations?.map((opWithContext) => ({
        operation: {
          index: opWithContext.operation.index,
          timestampUtcMs: opWithContext.operation.timestampUtcMs,
          hash: opWithContext.operation.hash,
          skip: opWithContext.operation.skip,
          error: opWithContext.operation.error,
          id: opWithContext.operation.id,
          action: this.serializeAction(opWithContext.operation.action),
        },
        context: {
          documentId: opWithContext.context.documentId,
          documentType: opWithContext.context.documentType,
          scope: opWithContext.context.scope,
          branch: opWithContext.context.branch,
        },
      })),
      cursor: envelope.cursor,
    };
  }

  /**
   * Serializes an action for GraphQL transport, converting signature tuples to strings.
   */
  private serializeAction(action: Action): unknown {
    const signer = action.context?.signer;
    if (!signer?.signatures) {
      return action;
    }

    return {
      ...action,
      context: {
        ...action.context,
        signer: {
          ...signer,
          signatures: signer.signatures.map((sig: Signature | string) =>
            Array.isArray(sig) ? sig.join(", ") : sig,
          ),
        },
      },
    };
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
   * Updates the synchronization cursor for this channel's remote.
   */
  async updateCursor(cursorOrdinal: number): Promise<void> {
    const cursor: RemoteCursor = {
      remoteName: this.remoteName,
      cursorOrdinal,
      lastSyncedAtUtcMs: Date.now(),
    };

    await this.cursorStorage.upsert(cursor);
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
