import type { ISyncCursorStorage } from "../../storage/interfaces.js";
import { ChannelError } from "../errors.js";
import type { IChannel } from "../interfaces.js";
import { Mailbox } from "../mailbox.js";
import type { SyncOperation } from "../sync-operation.js";
import type { RemoteCursor, RemoteFilter, SyncEnvelope } from "../types.js";
import { ChannelErrorSource } from "../types.js";
import { envelopeToSyncOperation } from "./utils.js";

/**
 * Configuration parameters for GqlChannel
 */
export type GqlChannelConfig = {
  /** The GraphQL endpoint URL */
  url: string;
  /** Authentication token for the remote */
  authToken?: string;
  /** Polling interval in milliseconds (default: 5000) */
  pollIntervalMs?: number;
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
  readonly inbox: Mailbox<SyncOperation>;
  readonly outbox: Mailbox<SyncOperation>;
  readonly deadLetter: Mailbox<SyncOperation>;

  private readonly channelId: string;
  private readonly remoteName: string;
  private readonly cursorStorage: ISyncCursorStorage;
  private readonly config: GqlChannelConfig;
  private isShutdown: boolean;
  private pollTimer?: NodeJS.Timeout;
  private failureCount: number;
  private lastSuccessUtcMs?: number;
  private lastFailureUtcMs?: number;

  constructor(
    channelId: string,
    remoteName: string,
    cursorStorage: ISyncCursorStorage,
    config: GqlChannelConfig,
  ) {
    this.channelId = channelId;
    this.remoteName = remoteName;
    this.cursorStorage = cursorStorage;
    this.config = {
      url: config.url,
      authToken: config.authToken,
      pollIntervalMs: config.pollIntervalMs ?? 5000,
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
    this.outbox = new Mailbox<SyncOperation>();
    this.deadLetter = new Mailbox<SyncOperation>();

    this.outbox.onAdded((syncOp) => {
      this.handleOutboxAdded(syncOp);
    });
  }

  /**
   * Shuts down the channel and prevents further operations.
   */
  shutdown(): void {
    this.isShutdown = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  /**
   * Initializes the channel by registering it on the remote server and starting polling.
   */
  async init(): Promise<void> {
    await this.touchRemoteChannel();
    this.startPolling();
  }

  /**
   * Starts the polling loop to fetch operations from the remote.
   */
  private startPolling(): void {
    if (this.isShutdown) {
      return;
    }

    this.pollTimer = setTimeout(() => {
      void this.poll().then(() => {
        this.startPolling(); // Schedule next poll
      });
    }, this.config.pollIntervalMs);
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

    for (const envelope of envelopes) {
      if (envelope.type === "operations" && envelope.operations) {
        const syncOp = envelopeToSyncOperation(envelope, this.remoteName);
        syncOp.transported();
        this.inbox.add(syncOp);
      }
    }

    this.lastSuccessUtcMs = Date.now();
    this.failureCount = 0;
  }

  /**
   * Handles polling errors with exponential backoff.
   */
  private handlePollError(error: unknown): void {
    this.failureCount++;
    this.lastFailureUtcMs = Date.now();

    const err = error instanceof Error ? error : new Error(String(error));
    const channelError = new ChannelError(ChannelErrorSource.Inbox, err);

    console.error(
      `GqlChannel poll error (${this.failureCount}/${this.config.maxFailures}):`,
      channelError,
    );

    if (this.failureCount >= this.config.maxFailures!) {
      console.error(
        `GqlChannel ${this.channelId} exceeded failure threshold, stopping polls`,
      );
    }
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
              resultingState
              id
              action
            }
            context {
              documentId
              documentType
              scope
              branch
              resultingState
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
    const mutation = `
      mutation TouchChannel($input: TouchChannelInput!) {
        touchChannel(input: $input)
      }
    `;

    const variables = {
      input: {
        id: this.channelId,
        name: this.remoteName,
        collectionId: this.config.collectionId,
        filter: {
          documentId: this.config.filter.documentId,
          scope: this.config.filter.scope,
          branch: this.config.filter.branch,
        },
      },
    };

    await this.executeGraphQL<{ touchChannel: boolean }>(mutation, variables);
  }

  /**
   * Handles sync operations added to the outbox by sending them to the remote.
   */
  private handleOutboxAdded(syncOp: SyncOperation): void {
    if (this.isShutdown) {
      return;
    }

    // Execute async but don't await (fire and forget with error handling)
    this.pushSyncOperation(syncOp).catch((error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      const channelError = new ChannelError(ChannelErrorSource.Outbox, err);
      syncOp.failed(channelError);
      this.deadLetter.add(syncOp);
      this.outbox.remove(syncOp);
    });
  }

  /**
   * Pushes a sync operation to the remote via GraphQL mutation.
   */
  private async pushSyncOperation(syncOp: SyncOperation): Promise<void> {
    syncOp.started();

    const envelope: SyncEnvelope = {
      type: "operations",
      channelMeta: { id: this.channelId },
      operations: syncOp.operations,
    };

    const mutation = `
      mutation PushSyncEnvelope($envelope: SyncEnvelopeInput!) {
        pushSyncEnvelope(envelope: $envelope)
      }
    `;

    const variables = {
      envelope: this.serializeEnvelope(envelope),
    };

    await this.executeGraphQL<{ pushSyncEnvelope: boolean }>(
      mutation,
      variables,
    );

    // Successfully sent - the outbox will be cleared when we receive ACK
    // For now, we optimistically remove from outbox
    this.outbox.remove(syncOp);
  }

  /**
   * Serializes a SyncEnvelope for GraphQL transport.
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
          resultingState: opWithContext.operation.resultingState,
          id: opWithContext.operation.id,
          action: opWithContext.operation.action,
        },
        context: opWithContext.context,
      })),
      cursor: envelope.cursor,
    };
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

    if (this.config.authToken) {
      headers["Authorization"] = `Bearer ${this.config.authToken}`;
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
}
