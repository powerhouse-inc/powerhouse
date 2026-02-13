import type { IOperationIndex } from "../../cache/operation-index-types.js";
import type { ILogger } from "../../logging/types.js";
import type { ISyncCursorStorage } from "../../storage/interfaces.js";
import type { IChannel, IChannelFactory } from "../interfaces.js";
import type { ChannelConfig, JwtHandler, RemoteFilter } from "../types.js";
import { GqlRequestChannel, type GqlChannelConfig } from "./gql-req-channel.js";
import { GqlResponseChannel } from "./gql-res-channel.js";
import { IntervalPollTimer } from "./interval-poll-timer.js";

/**
 * Factory for creating channel instances of multiple types.
 */
export class CompositeChannelFactory implements IChannelFactory {
  private readonly logger: ILogger;
  private readonly jwtHandler?: JwtHandler;

  constructor(logger: ILogger, jwtHandler?: JwtHandler) {
    this.logger = logger;
    this.jwtHandler = jwtHandler;
  }

  /**
   * Creates a new channel instance based on the configuration type.
   *
   * @param remoteId - Unique identifier for the remote
   * @param remoteName - Human-readable name for the remote
   * @param config - Channel configuration including type and parameters
   * @param cursorStorage - Storage for persisting synchronization cursors
   * @param collectionId - Collection ID for filtering
   * @param filter - Remote filter configuration
   * @param operationIndex - Operation index for querying timestamps
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
    operationIndex: IOperationIndex,
  ): IChannel {
    if (config.type === "gql") {
      return this.createGqlChannel(
        remoteId,
        remoteName,
        config,
        cursorStorage,
        collectionId,
        filter,
        operationIndex,
      );
    }

    if (config.type === "polling") {
      return this.createPollingChannel(remoteId, remoteName, cursorStorage);
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
    operationIndex: IOperationIndex,
  ): GqlRequestChannel {
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
      jwtHandler: this.jwtHandler,
    };

    let pollIntervalMs = 2000;
    if (config.parameters.pollIntervalMs !== undefined) {
      if (typeof config.parameters.pollIntervalMs !== "number") {
        throw new Error('"pollIntervalMs" parameter must be a number');
      }
      pollIntervalMs = config.parameters.pollIntervalMs;
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

    const pollTimer = new IntervalPollTimer(pollIntervalMs);

    return new GqlRequestChannel(
      this.logger,
      remoteId,
      remoteName,
      cursorStorage,
      gqlConfig,
      operationIndex,
      pollTimer,
    );
  }

  private createPollingChannel(
    remoteId: string,
    remoteName: string,
    cursorStorage: ISyncCursorStorage,
  ): GqlResponseChannel {
    return new GqlResponseChannel(
      this.logger,
      remoteId,
      remoteName,
      cursorStorage,
    );
  }
}
