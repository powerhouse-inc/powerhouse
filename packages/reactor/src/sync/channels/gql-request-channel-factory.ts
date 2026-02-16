import type { IOperationIndex } from "../../cache/operation-index-types.js";
import type { ILogger } from "../../logging/types.js";
import type { IQueue } from "../../queue/interfaces.js";
import type { ISyncCursorStorage } from "../../storage/interfaces.js";
import type { IChannel, IChannelFactory } from "../interfaces.js";
import type { ChannelConfig, JwtHandler, RemoteFilter } from "../types.js";
import { GqlRequestChannel, type GqlChannelConfig } from "./gql-req-channel.js";
import { IntervalPollTimer } from "./interval-poll-timer.js";

/**
 * Factory for creating GqlRequestChannel instances.
 *
 * Extracts GraphQL-specific configuration from ChannelConfig.parameters and
 * instantiates GqlRequestChannel instances for network-based synchronization.
 *
 * The optional jwtHandler enables dynamic JWT token generation per-request,
 * which is useful for short-lived tokens with audience-specific claims.
 */
export class GqlRequestChannelFactory implements IChannelFactory {
  private readonly logger: ILogger;
  private readonly jwtHandler?: JwtHandler;
  private readonly queue: IQueue;

  constructor(
    logger: ILogger,
    jwtHandler: JwtHandler | undefined,
    queue: IQueue,
  ) {
    this.logger = logger;
    this.jwtHandler = jwtHandler;
    this.queue = queue;
  }

  /**
   * Creates a new GqlRequestChannel instance with the given configuration.
   * See GqlChannelConfig for the expected parameters.
   *
   * @param config - Channel configuration including type and parameters
   * @param cursorStorage - Storage for persisting synchronization cursors
   * @param operationIndex - Operation index for querying timestamps
   * @returns A new GqlRequestChannel instance
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
    // Extract and validate required parameters
    const url = config.parameters.url;
    if (typeof url !== "string" || !url) {
      throw new Error(
        'GqlRequestChannelFactory requires "url" parameter in config.parameters',
      );
    }

    // Extract optional parameters with validation
    const gqlConfig: GqlChannelConfig = {
      url,
      collectionId,
      filter,
      jwtHandler: this.jwtHandler,
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 300000,
    };

    let pollIntervalMs = 2000;
    if (config.parameters.pollIntervalMs !== undefined) {
      if (typeof config.parameters.pollIntervalMs !== "number") {
        throw new Error('"pollIntervalMs" parameter must be a number');
      }
      pollIntervalMs = config.parameters.pollIntervalMs;
    }

    let retryBaseDelayMs: number | undefined;
    if (config.parameters.retryBaseDelayMs !== undefined) {
      if (typeof config.parameters.retryBaseDelayMs !== "number") {
        throw new Error('"retryBaseDelayMs" parameter must be a number');
      }
      retryBaseDelayMs = config.parameters.retryBaseDelayMs;
    }

    let retryMaxDelayMs: number | undefined;
    if (config.parameters.retryMaxDelayMs !== undefined) {
      if (typeof config.parameters.retryMaxDelayMs !== "number") {
        throw new Error('"retryMaxDelayMs" parameter must be a number');
      }
      retryMaxDelayMs = config.parameters.retryMaxDelayMs;
    }

    if (config.parameters.fetchFn !== undefined) {
      if (typeof config.parameters.fetchFn !== "function") {
        throw new Error('"fetchFn" parameter must be a function');
      }
      gqlConfig.fetchFn = config.parameters.fetchFn as typeof fetch;
    }

    if (retryBaseDelayMs !== undefined) {
      gqlConfig.retryBaseDelayMs = retryBaseDelayMs;
    }
    if (retryMaxDelayMs !== undefined) {
      gqlConfig.retryMaxDelayMs = retryMaxDelayMs;
    }

    let maxQueueDepth: number | undefined;
    if (config.parameters.maxQueueDepth !== undefined) {
      if (typeof config.parameters.maxQueueDepth !== "number") {
        throw new Error('"maxQueueDepth" parameter must be a number');
      }
      maxQueueDepth = config.parameters.maxQueueDepth;
    }

    let backpressureCheckIntervalMs: number | undefined;
    if (config.parameters.backpressureCheckIntervalMs !== undefined) {
      if (typeof config.parameters.backpressureCheckIntervalMs !== "number") {
        throw new Error(
          '"backpressureCheckIntervalMs" parameter must be a number',
        );
      }
      backpressureCheckIntervalMs =
        config.parameters.backpressureCheckIntervalMs;
    }

    const pollTimer = new IntervalPollTimer(this.queue, {
      intervalMs: pollIntervalMs,
      ...(retryBaseDelayMs !== undefined && { retryBaseDelayMs }),
      ...(retryMaxDelayMs !== undefined && { retryMaxDelayMs }),
      ...(maxQueueDepth !== undefined && { maxQueueDepth }),
      ...(backpressureCheckIntervalMs !== undefined && {
        backpressureCheckIntervalMs,
      }),
    });

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
}
