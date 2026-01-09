import type { ILogger } from "../../logging/types.js";
import type { ISyncCursorStorage } from "../../storage/interfaces.js";
import type { IChannel, IChannelFactory } from "../interfaces.js";
import type { ChannelConfig, RemoteFilter } from "../types.js";
import { GqlChannel, type GqlChannelConfig } from "./gql-channel.js";

/**
 * Factory for creating GqlChannel instances.
 *
 * Extracts GraphQL-specific configuration from ChannelConfig.parameters and
 * instantiates GqlChannel instances for network-based synchronization.
 */
export class GqlChannelFactory implements IChannelFactory {
  private readonly logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  /**
   * Creates a new GqlChannel instance with the given configuration.
   * See GqlChannelConfig for the expected parameters.
   *
   * @param config - Channel configuration including type and parameters
   * @param cursorStorage - Storage for persisting synchronization cursors
   * @returns A new GqlChannel instance
   * @throws Error if config.type is not "gql" or required parameters are missing
   */
  instance(
    remoteId: string,
    remoteName: string,
    config: ChannelConfig,
    cursorStorage: ISyncCursorStorage,
    collectionId: string,
    filter: RemoteFilter,
  ): IChannel {
    if (config.type !== "gql") {
      throw new Error(
        `GqlChannelFactory can only create channels of type "gql", got "${config.type}"`,
      );
    }

    // Extract and validate required parameters
    const url = config.parameters.url;
    if (typeof url !== "string" || !url) {
      throw new Error(
        'GqlChannelFactory requires "url" parameter in config.parameters',
      );
    }

    // Extract optional parameters with validation
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

    return new GqlChannel(
      this.logger,
      remoteId,
      remoteName,
      cursorStorage,
      gqlConfig,
    );
  }
}
