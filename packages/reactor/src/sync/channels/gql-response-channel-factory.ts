import type { ILogger } from "../../logging/types.js";
import type { ISyncCursorStorage } from "../../storage/interfaces.js";
import type { IChannel, IChannelFactory } from "../interfaces.js";
import type { ChannelConfig } from "../types.js";
import { GqlResponseChannel } from "./gql-res-channel.js";

/**
 * Factory for creating GqlResponseChannel instances.
 */
export class GqlResponseChannelFactory implements IChannelFactory {
  private readonly logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  instance(
    remoteId: string,
    remoteName: string,
    config: ChannelConfig,
    cursorStorage: ISyncCursorStorage,
  ): IChannel {
    return new GqlResponseChannel(
      this.logger,
      remoteId,
      remoteName,
      cursorStorage,
    );
  }
}
