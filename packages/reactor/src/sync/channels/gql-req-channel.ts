import type { ILogger } from "document-model";
import type { IOperationIndex } from "../../cache/operation-index-types.js";
import type { ISyncCursorStorage } from "../../storage/interfaces.js";
import { BufferedMailbox } from "../buffered-mailbox.js";
import { ChannelError, GraphQLRequestError } from "../errors.js";
import type { ConnectionStateChangeCallback, IChannel } from "../interfaces.js";
import { type IMailbox, Mailbox } from "../mailbox.js";
import { SyncOperation } from "../sync-operation.js";
import type {
  ConnectionState,
  ConnectionStateSnapshot,
  JwtHandler,
  RemoteFilter,
  SyncEnvelope,
} from "../types.js";
import { ChannelErrorSource } from "../types.js";
import {
  consolidateSyncOperations,
  sortEnvelopesByFirstOperationTimestamp,
  trimMailboxFromAckOrdinal,
} from "../utils.js";
import { calculateBackoffDelay } from "./interval-poll-timer.js";
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
  /** Custom fetch function for testing (default: global fetch) */
  fetchFn?: typeof fetch;
  /** Collection ID to synchronize */
  collectionId: string;
  /** Filter to apply to operations */
  filter: RemoteFilter;
  /** Base delay in ms for exponential backoff on push retries */
  retryBaseDelayMs: number;
  /** Maximum delay in ms for exponential backoff on push retries */
  retryMaxDelayMs: number;
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
  private readonly abortController = new AbortController();
  private isShutdown: boolean;
  private failureCount: number;
  private lastSuccessUtcMs?: number;
  private lastFailureUtcMs?: number;
  private lastPersistedInboxOrdinal: number = 0;
  private lastPersistedOutboxOrdinal: number = 0;
  private pushFailureCount: number = 0;
  private pushRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private pushBlocked: boolean = false;
  private isPushing: boolean = false;
  private pendingDrain: boolean = false;
  private connectionState: ConnectionState = "connecting";
  private readonly connectionStateCallbacks: Set<ConnectionStateChangeCallback> =
    new Set();

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
      fetchFn: config.fetchFn,
      collectionId: config.collectionId,
      filter: config.filter,
      retryBaseDelayMs: config.retryBaseDelayMs,
      retryMaxDelayMs: config.retryMaxDelayMs,
    };
    this.isShutdown = false;
    this.failureCount = 0;

    this.inbox = new Mailbox();
    this.bufferedOutbox = new BufferedMailbox(500, 25);
    this.outbox = this.bufferedOutbox;
    this.deadLetter = new Mailbox();

    this.deadLetter.onAdded((syncOps) => {
      for (const syncOp of syncOps) {
        this.logger.warn(
          "Dead letter added for document @DocumentId on channel @ChannelId",
          syncOp.documentId,
          this.channelId,
        );
      }
    });

    // when sync ops are added to the outbox, push them to the remote
    this.outbox.onAdded((syncOps) => {
      if (this.isShutdown) return;
      if (this.isPushing) {
        this.pendingDrain = true;
        return;
      }
      if (this.pushBlocked) return; // ops stay in outbox, included in next retry
      this.attemptPush(syncOps);
    });

    // Instead of listening to syncops directly for cursor updates, we listen
    // to the mailbox. This is for efficiency: many syncops may fire on a trim,
    // but only one onRemoved callback will be fired for the batch.
    this.outbox.onRemoved((syncOps) => {
      const maxOrdinal = getLatestAppliedOrdinal(syncOps);
      if (maxOrdinal > this.lastPersistedOutboxOrdinal) {
        this.lastPersistedOutboxOrdinal = maxOrdinal;
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
      if (maxOrdinal > this.lastPersistedInboxOrdinal) {
        this.lastPersistedInboxOrdinal = maxOrdinal;
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
    this.abortController.abort();
    this.bufferedOutbox.flush();
    this.isShutdown = true;
    this.pollTimer.stop();

    if (this.pushRetryTimer) {
      clearTimeout(this.pushRetryTimer);
      this.pushRetryTimer = null;
    }

    this.transitionConnectionState("disconnected");

    return Promise.resolve();
  }

  getConnectionState(): ConnectionStateSnapshot {
    return {
      state: this.connectionState,
      failureCount: this.failureCount,
      lastSuccessUtcMs: this.lastSuccessUtcMs ?? 0,
      lastFailureUtcMs: this.lastFailureUtcMs ?? 0,
      pushBlocked: this.pushBlocked,
      pushFailureCount: this.pushFailureCount,
    };
  }

  onConnectionStateChange(callback: ConnectionStateChangeCallback): () => void {
    this.connectionStateCallbacks.add(callback);
    return () => {
      this.connectionStateCallbacks.delete(callback);
    };
  }

  /**
   * Initializes the channel by registering it on the remote server and starting polling.
   */
  async init(): Promise<void> {
    const { ackOrdinal } = await this.touchRemoteChannel();

    // get cursors -- these are the last acknowledged ordinals for the inbox and outbox
    const cursors = await this.cursorStorage.list(this.remoteName);
    const inboxOrdinal =
      cursors.find((c) => c.cursorType === "inbox")?.cursorOrdinal ?? 0;
    const outboxOrdinal =
      cursors.find((c) => c.cursorType === "outbox")?.cursorOrdinal ?? 0;
    this.inbox.init(inboxOrdinal);
    this.outbox.init(outboxOrdinal);
    this.lastPersistedInboxOrdinal = inboxOrdinal;
    this.lastPersistedOutboxOrdinal = outboxOrdinal;

    if (ackOrdinal > 0) {
      trimMailboxFromAckOrdinal(this.outbox, ackOrdinal);
    }

    this.pollTimer.setDelegate(() => this.poll());
    this.pollTimer.start();
    this.transitionConnectionState("connected");
  }

  private transitionConnectionState(next: ConnectionState): void {
    if (this.connectionState === next) return;
    this.connectionState = next;
    const snapshot = this.getConnectionState();
    for (const callback of this.connectionStateCallbacks) {
      try {
        callback(snapshot);
      } catch (error) {
        this.logger.error(
          "Connection state change callback error: @Error",
          error,
        );
      }
    }
  }

  /**
   * Polls the remote for new sync envelopes.
   */
  private async poll(): Promise<void> {
    if (this.isShutdown) {
      return;
    }

    let response;
    try {
      response = await this.pollSyncEnvelopes(
        this.inbox.ackOrdinal,
        this.inbox.latestOrdinal,
      );
    } catch (error) {
      if (!this.handlePollError(error)) {
        throw error;
      }
      return;
    }

    const { envelopes, ackOrdinal, deadLetters } = response;

    // first: trim outbox
    if (ackOrdinal > 0) {
      trimMailboxFromAckOrdinal(this.outbox, ackOrdinal);
    }

    // todo: Is this necessary? Outbox items should have been sorted when returned.
    const sortedEnvelopes = sortEnvelopesByFirstOperationTimestamp(envelopes);

    // convert the envelopes to sync operations
    const allSyncOps: SyncOperation[] = [];
    for (const envelope of sortedEnvelopes) {
      if (envelope.type.toLowerCase() === "operations" && envelope.operations) {
        const syncOps = envelopesToSyncOperations(envelope, this.remoteName);
        for (const syncOp of syncOps) {
          syncOp.transported();
        }
        allSyncOps.push(...syncOps);
      }
    }

    // merge SyncOps sharing the same (documentId, scope, branch) so
    // multiple polled envelopes for one document become a single load job
    const consolidated =
      allSyncOps.length > 1
        ? consolidateSyncOperations(allSyncOps)
        : allSyncOps;

    if (consolidated.length > 0) {
      this.inbox.add(...consolidated);
    }

    // handle dead letters from the remote
    if (deadLetters.length > 0) {
      this.handleRemoteDeadLetters(deadLetters);
    }

    this.lastSuccessUtcMs = Date.now();
    this.failureCount = 0;
    this.transitionConnectionState("connected");
  }

  /**
   * Handles dead letters reported by the remote server.
   * Creates local dead letter SyncOperations so the channel quiesces.
   */
  private handleRemoteDeadLetters(
    deadLetters: Array<{
      documentId: string;
      error: string;
      jobId: string;
      branch: string;
      scopes: string[];
      operationCount: number;
    }>,
  ): void {
    for (const dl of deadLetters) {
      this.logger.error(
        "Remote dead letter on @ChannelId: document @DocumentId failed with: @Error",
        this.channelId,
        dl.documentId,
        dl.error,
      );
    }

    const syncOps: SyncOperation[] = [];
    for (const dl of deadLetters) {
      const syncOp = new SyncOperation(
        crypto.randomUUID(),
        dl.jobId,
        [],
        this.remoteName,
        dl.documentId,
        dl.scopes,
        dl.branch,
        [],
      );
      syncOp.failed(
        new ChannelError(ChannelErrorSource.Outbox, new Error(dl.error)),
      );
      syncOps.push(syncOp);
    }
    this.deadLetter.add(...syncOps);
  }

  /**
   * Handles polling errors with error classification.
   * Returns true if the error was handled (caller should not rethrow).
   */
  private handlePollError(error: unknown): boolean {
    if (this.isShutdown) return true;

    const err = error instanceof Error ? error : new Error(String(error));

    if (err.message.includes("Channel not found")) {
      this.transitionConnectionState("reconnecting");
      this.recoverFromChannelNotFound();
      return true;
    }

    const classification = this.classifyError(err);

    this.failureCount++;
    this.lastFailureUtcMs = Date.now();

    const channelError = new ChannelError(ChannelErrorSource.Inbox, err);

    this.logger.error(
      "GqlChannel poll error (@FailureCount, @Classification): @Error",
      this.failureCount,
      classification,
      channelError,
    );

    if (classification === "unrecoverable") {
      this.pollTimer.stop();
      this.transitionConnectionState("error");
      return true;
    }

    this.transitionConnectionState("error");
    return false;
  }

  /**
   * Recovers from a "Channel not found" error by re-registering and restarting polling.
   * Self-retries with backoff instead of restarting the poll timer on failure.
   */
  private recoverFromChannelNotFound(): void {
    this.logger.info(
      "GqlChannel @ChannelId not found on remote, re-registering...",
      this.channelId,
    );

    this.pollTimer.stop();

    const attemptRecovery = (attempt: number): void => {
      if (this.isShutdown) return;

      void this.touchRemoteChannel()
        .then(({ ackOrdinal }) => {
          this.logger.info(
            "GqlChannel @ChannelId re-registered successfully",
            this.channelId,
          );
          this.failureCount = 0;
          if (ackOrdinal > 0) {
            trimMailboxFromAckOrdinal(this.outbox, ackOrdinal);
          }
          this.pollTimer.start();
          this.transitionConnectionState("connected");
        })
        .catch((recoveryError: unknown) => {
          const err =
            recoveryError instanceof Error
              ? recoveryError
              : new Error(String(recoveryError));
          const classification = this.classifyError(err);

          this.logger.error(
            "GqlChannel @ChannelId recovery attempt @Attempt failed (@Classification): @Error",
            this.channelId,
            attempt,
            classification,
            recoveryError,
          );

          this.failureCount++;
          this.lastFailureUtcMs = Date.now();

          if (classification === "unrecoverable") {
            this.transitionConnectionState("error");
            return;
          }

          this.transitionConnectionState("reconnecting");
          const delay = calculateBackoffDelay(
            attempt,
            this.config.retryBaseDelayMs,
            this.config.retryMaxDelayMs,
            Math.random(),
          );
          setTimeout(() => attemptRecovery(attempt + 1), delay);
        });
    };

    attemptRecovery(1);
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
    deadLetters: Array<{
      documentId: string;
      error: string;
      jobId: string;
      branch: string;
      scopes: string[];
      operationCount: number;
    }>;
  }> {
    const query = `
      query PollSyncEnvelopes($channelId: String!, $outboxAck: Int!, $outboxLatest: Int!) {
        pollSyncEnvelopes(channelId: $channelId, outboxAck: $outboxAck, outboxLatest: $outboxLatest) {
          envelopes {
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
                ordinal
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
          ackOrdinal
          deadLetters {
            documentId
            error
            jobId
            branch
            scopes
            operationCount
          }
        }
      }
    `;

    const variables = {
      channelId: this.channelId,
      outboxAck: ackOrdinal,
      outboxLatest: latestOrdinal,
    };

    const response = await this.executeGraphQL<{
      pollSyncEnvelopes: {
        envelopes: SyncEnvelope[];
        ackOrdinal: number;
        deadLetters?: Array<{
          documentId: string;
          error: string;
          jobId: string;
          branch: string;
          scopes: string[];
          operationCount: number;
        }>;
      };
    }>(query, variables);

    return {
      envelopes: response.pollSyncEnvelopes.envelopes,
      ackOrdinal: response.pollSyncEnvelopes.ackOrdinal,
      deadLetters: response.pollSyncEnvelopes.deadLetters ?? [],
    };
  }

  /**
   * Registers or updates this channel on the remote server via GraphQL mutation.
   * Returns the remote's ack ordinal so the client can trim its outbox.
   */
  private async touchRemoteChannel(): Promise<{ ackOrdinal: number }> {
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
        touchChannel(input: $input) {
          success
          ackOrdinal
        }
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

    const data = await this.executeGraphQL<{
      touchChannel: { success: boolean; ackOrdinal: number };
    }>(mutation, variables);

    if (!data.touchChannel.success) {
      throw new GraphQLRequestError(
        "touchChannel returned success=false",
        "graphql",
      );
    }

    return { ackOrdinal: data.touchChannel.ackOrdinal };
  }

  /**
   * Fire-and-forget push with retry on recoverable errors.
   * On success, clears push blocked state. On recoverable error, blocks
   * further pushes and schedules a retry. On unrecoverable error, moves
   * ops to deadLetter.
   */
  private attemptPush(syncOps: SyncOperation[]): void {
    this.isPushing = true;
    this.pushSyncOperations(syncOps)
      .then(() => {
        this.isPushing = false;
        this.pushBlocked = false;
        this.pushFailureCount = 0;
        if (
          this.connectionState === "reconnecting" ||
          this.connectionState === "error"
        ) {
          this.transitionConnectionState("connected");
        }
        this.drainOutbox();
      })
      .catch((error) => {
        this.isPushing = false;
        this.pendingDrain = false;
        if (this.isShutdown) return;

        const err = error instanceof Error ? error : new Error(String(error));
        const classification = this.classifyError(err);

        if (classification === "recoverable") {
          this.pushFailureCount++;
          this.pushBlocked = true;
          this.logger.error(
            "GqlChannel push failed (attempt @FailureCount), will retry: @Error",
            this.pushFailureCount,
            err,
          );
          this.transitionConnectionState("reconnecting");
          this.schedulePushRetry();
        } else {
          const channelError = new ChannelError(ChannelErrorSource.Outbox, err);
          for (const syncOp of syncOps) {
            syncOp.failed(channelError);
          }
          this.deadLetter.add(...syncOps);
          this.outbox.remove(...syncOps);
          this.transitionConnectionState("error");
        }
      });
  }

  /**
   * Schedules a retry of all current outbox items using exponential backoff.
   */
  private schedulePushRetry(): void {
    if (this.pushRetryTimer) return;

    const delay = calculateBackoffDelay(
      this.pushFailureCount,
      this.config.retryBaseDelayMs,
      this.config.retryMaxDelayMs,
      Math.random(),
    );

    this.pushRetryTimer = setTimeout(() => {
      this.pushRetryTimer = null;

      if (this.isShutdown) return;

      const allItems = this.outbox.items;
      if (allItems.length === 0) {
        this.pushBlocked = false;
        this.pushFailureCount = 0;
        return;
      }

      this.attemptPush([...allItems]);
    }, delay);
  }

  /**
   * Drains pending outbox items that arrived while a push was in-flight.
   * Server-side action.id dedup handles any overlap with the previous push.
   */
  private drainOutbox(): void {
    if (!this.pendingDrain) return;
    this.pendingDrain = false;
    if (this.isShutdown) return;
    const items = this.outbox.items;
    if (items.length === 0) return;
    this.attemptPush([...items]);
  }

  /**
   * Classifies an error as recoverable or unrecoverable based on its type.
   * Recoverable errors are transient and worth retrying (network, 5xx, parse).
   * Unrecoverable errors will not self-heal (auth, client errors, GraphQL rejections).
   */
  private classifyError(error: Error): "recoverable" | "unrecoverable" {
    if (!(error instanceof GraphQLRequestError)) {
      return "recoverable";
    }

    switch (error.category) {
      case "network":
        return "recoverable";
      case "http": {
        if (error.statusCode !== undefined && error.statusCode >= 500) {
          return "recoverable";
        }
        return "unrecoverable";
      }
      case "parse":
        return "recoverable";
      case "graphql":
        return "unrecoverable";
      case "missing-data":
        return "unrecoverable";
    }
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

    const operationMatch = query.match(/(?:query|mutation)\s+(\w+)/);
    const operationName = operationMatch?.[1] ?? "unknown";

    this.logger.verbose(
      "GQL request @channelId @operation @url vars=@variables",
      this.channelId,
      operationName,
      this.config.url,
      JSON.stringify(variables),
    );

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
        signal: this.abortController.signal,
      });
    } catch (error) {
      throw new GraphQLRequestError(
        `GraphQL request failed: ${error instanceof Error ? error.message : String(error)}`,
        "network",
      );
    }

    if (!response.ok) {
      throw new GraphQLRequestError(
        `GraphQL request failed: ${response.status} ${response.statusText}`,
        "http",
        response.status,
      );
    }

    let result;
    try {
      result = (await response.json()) as {
        data?: T;
        errors?: Array<{ message: string }>;
      };
    } catch (error) {
      throw new GraphQLRequestError(
        `Failed to parse GraphQL response: ${error instanceof Error ? error.message : String(error)}`,
        "parse",
      );
    }

    this.logger.verbose(
      "GQL response @channelId @operation status=@status data=@data errors=@errors",
      this.channelId,
      operationName,
      response.status,
      JSON.stringify(result.data),
      result.errors ? JSON.stringify(result.errors) : "none",
    );

    if (result.errors) {
      throw new GraphQLRequestError(
        `GraphQL errors: ${JSON.stringify(result.errors, null, 2)}`,
        "graphql",
      );
    }

    if (!result.data) {
      throw new GraphQLRequestError(
        "GraphQL response missing data field",
        "missing-data",
      );
    }

    return result.data;
  }

  get poller(): IPollTimer {
    return this.pollTimer;
  }
}
