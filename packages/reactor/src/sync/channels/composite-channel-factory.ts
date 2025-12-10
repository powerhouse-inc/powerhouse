import type { ISyncCursorStorage } from "../../storage/interfaces.js";
import type { IChannel, IChannelFactory } from "../interfaces.js";
import type { ChannelConfig, RemoteFilter } from "../types.js";
import { GqlChannel, type GqlChannelConfig } from "./gql-channel.js";
import { InternalChannel } from "./internal-channel.js";
import type { SyncEnvelope } from "../types.js";

/**
 * Factory for creating channel instances of multiple types.
 *
 * Supports both "gql" channels for network-based synchronization and
 * "internal" channels for in-process communication.
 */
export class CompositeChannelFactory implements IChannelFactory {
  /**
   * Creates a new channel instance based on the configuration type.
   *
   * @param remoteId - Unique identifier for the remote
   * @param remoteName - Human-readable name for the remote
   * @param config - Channel configuration including type and parameters
   * @param cursorStorage - Storage for persisting synchronization cursors
   * @param collectionId - Collection ID for filtering
   * @param filter - Remote filter configuration
   * @returns A new channel instance
   * @throws Error if config.type is not supported or required parameters are missing
   */
  instance(
    remoteId: string,
    remoteName: string,
    config: ChannelConfig,
    cursorStorage: ISyncCursorStorage,
    collectionId: string,
    filter: RemoteFilter,
  ): IChannel {
    if (config.type === "gql") {
      return this.createGqlChannel(
        remoteId,
        remoteName,
        config,
        cursorStorage,
        collectionId,
        filter,
      );
    }

    if (config.type === "internal") {
      return this.createInternalChannel(remoteId, remoteName, cursorStorage);
    }

    throw new Error(
      `CompositeChannelFactory does not support channel type "${config.type}"`,
    );
  }

  private createGqlChannel(
    remoteId: string,
    remoteName: string,
    config: ChannelConfig,
    cursorStorage: ISyncCursorStorage,
    collectionId: string,
    filter: RemoteFilter,
  ): GqlChannel {
    const url = config.parameters.url;
    if (typeof url !== "string" || !url) {
      throw new Error(
        'CompositeChannelFactory requires "url" parameter for gql channels',
      );
    }

    const gqlConfig: GqlChannelConfig = {
      url,
      collectionId,
      filter,
    };

    if (config.parameters.authToken !== undefined) {
      if (typeof config.parameters.authToken !== "string") {
        throw new Error('"authToken" parameter must be a string');
      }
      gqlConfig.authToken = config.parameters.authToken;
    }

    if (config.parameters.pollIntervalMs !== undefined) {
      if (typeof config.parameters.pollIntervalMs !== "number") {
        throw new Error('"pollIntervalMs" parameter must be a number');
      }
      gqlConfig.pollIntervalMs = config.parameters.pollIntervalMs;
    }

    if (config.parameters.retryBaseDelayMs !== undefined) {
      if (typeof config.parameters.retryBaseDelayMs !== "number") {
        throw new Error('"retryBaseDelayMs" parameter must be a number');
      }
      gqlConfig.retryBaseDelayMs = config.parameters.retryBaseDelayMs;
    }

    if (config.parameters.retryMaxDelayMs !== undefined) {
      if (typeof config.parameters.retryMaxDelayMs !== "number") {
        throw new Error('"retryMaxDelayMs" parameter must be a number');
      }
      gqlConfig.retryMaxDelayMs = config.parameters.retryMaxDelayMs;
    }

    if (config.parameters.maxFailures !== undefined) {
      if (typeof config.parameters.maxFailures !== "number") {
        throw new Error('"maxFailures" parameter must be a number');
      }
      gqlConfig.maxFailures = config.parameters.maxFailures;
    }

    if (config.parameters.fetchFn !== undefined) {
      if (typeof config.parameters.fetchFn !== "function") {
        throw new Error('"fetchFn" parameter must be a function');
      }
      gqlConfig.fetchFn = config.parameters.fetchFn as typeof fetch;
    }

    return new GqlChannel(remoteId, remoteName, cursorStorage, gqlConfig);
  }

  private createInternalChannel(
    remoteId: string,
    remoteName: string,
    cursorStorage: ISyncCursorStorage,
  ): InternalChannel {
    const noopSend = (_envelope: SyncEnvelope): void => {
      // Internal channels created via touchChannel are receive-only
    };

    return new InternalChannel(remoteId, remoteName, cursorStorage, noopSend);
  }
}
