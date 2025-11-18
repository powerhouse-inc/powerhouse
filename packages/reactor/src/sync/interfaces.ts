import type { ShutdownStatus } from "../shared/types.js";
import type { ISyncCursorStorage } from "../storage/interfaces.js";
import type { SyncOperation } from "./sync-operation.js";
import type { Mailbox } from "./mailbox.js";
import type { ChannelConfig, RemoteFilter, RemoteOptions } from "./types.js";

/**
 * Represents a bidirectional synchronization channel between two reactor instances.
 *
 * A channel manages three mailboxes:
 * - inbox: Sync operations received from the remote that need to be applied locally
 * - outbox: Sync operations to be sent to the remote
 * - deadLetter: Sync operations that failed and cannot be retried
 *
 * Channels are responsible for:
 * - Transporting sync envelopes between reactor instances
 * - Managing sync operation lifecycle through status transitions
 * - Handling errors and moving failed sync operations to dead letter queue
 * - Updating cursors as operations are applied
 */
export interface IChannel {
  /**
   * Mailbox containing sync operations received from the remote that need to be applied locally.
   * Consumers should register callbacks via onAdded to process incoming sync operations.
   */
  inbox: Mailbox<SyncOperation>;

  /**
   * Mailbox containing sync operations that need to be sent to the remote.
   * The channel is responsible for transporting these sync operations and handling ACKs.
   */
  outbox: Mailbox<SyncOperation>;

  /**
   * Mailbox containing sync operations that failed and cannot be retried.
   * These sync operations require manual intervention or should be logged for debugging.
   */
  deadLetter: Mailbox<SyncOperation>;

  /**
   * Shuts down the channel and prevents further operations.
   */
  shutdown(): void;
}

/**
 * Factory for creating channel instances.
 *
 * Different channel implementations (InternalChannel, GqlChannel, etc.) will have
 * their own factories that implement this interface.
 */
export interface IChannelFactory {
  /**
   * Creates a new channel instance with the given configuration.
   *
   * @param config - Channel configuration including type and parameters
   * @param cursorStorage - Storage for persisting synchronization cursors
   * @returns A new channel instance
   */
  instance(config: ChannelConfig, cursorStorage: ISyncCursorStorage): IChannel;
}

/**
 * Represents a configured remote with an active channel.
 *
 * A remote defines what to synchronize (collectionId, filter) and how to synchronize it (channel).
 * The remote name is used as a unique identifier across the system.
 */
export type Remote = {
  /**
   * Unique name for this remote.
   */
  name: string;

  /**
   * Collection ID to synchronize.
   * Typically created via driveCollectionId(branch, documentId) for drive-level sync.
   */
  collectionId: string;

  /**
   * Filter to apply to operations.
   * Can filter by documentId, scope, and branch.
   */
  filter: RemoteFilter;

  /**
   * Additional configuration options for the remote.
   */
  options: RemoteOptions;

  /**
   * Active channel for bidirectional communication with the remote.
   */
  channel: IChannel;
};

/**
 * Orchestrates all synchronization activity for a reactor instance.
 */
export interface ISyncManager {
  /**
   * Starts the synchronization manager.
   *
   * This recreates all remotes from storage and prepares channels for synchronization.
   * Each remote's channel will begin processing its inbox/outbox mailboxes.
   *
   * @returns Promise that resolves when the manager is started
   */
  startup(): Promise<void>;

  /**
   * Shuts down the synchronization manager.
   *
   * This stops all channels, flushes pending operations, and releases resources.
   * The shutdown status indicates whether the system was cleanly shut down.
   *
   * @returns Status object with shutdown information
   */
  shutdown(): ShutdownStatus;

  /**
   * Gets a remote by name.
   *
   * @param name - The name of the remote
   * @returns The remote
   * @throws Error if the remote does not exist
   */
  get(name: string): Remote;

  /**
   * Adds a new remote and starts its channel.
   *
   * The remote configuration is persisted to storage and a channel is created
   * using the appropriate factory. The channel begins processing immediately.
   *
   * @param name - Unique name for the remote
   * @param collectionId - Collection ID to synchronize
   * @param channelConfig - Configuration for the channel type and parameters
   * @param filter - Optional filter for operations (defaults to no filtering)
   * @param options - Optional remote configuration options
   * @returns Promise that resolves with the created remote
   * @throws Error if a remote with this name already exists
   */
  add(
    name: string,
    collectionId: string,
    channelConfig: ChannelConfig,
    filter?: RemoteFilter,
    options?: RemoteOptions,
  ): Promise<Remote>;

  /**
   * Removes a remote and stops its channel.
   *
   * The remote configuration is removed from storage and the channel is shut down.
   * Any pending sync operations in the channel's mailboxes will be processed before shutdown.
   *
   * @param name - The name of the remote to remove
   * @returns Promise that resolves when the remote is removed
   * @throws Error if the remote does not exist
   */
  remove(name: string): Promise<void>;

  /**
   * Lists all configured remotes.
   *
   * @returns Array of all remotes
   */
  list(): Remote[];
}
