import type { ILogger } from "document-model";
import type { ISyncCursorStorage } from "../../storage/interfaces.js";
import type { IChannel, IChannelFactory } from "../interfaces.js";
import type { ChannelConfig } from "../types.js";
import { GqlResponseChannel } from "./gql-res-channel.js";

/**
 * Factory for creating GqlResponseChannel instances.
 */
export const POLLING_CHANNEL_TYPE = "polling";

export class GqlResponseChannelFactory implements IChannelFactory {
  readonly channelTypes: readonly string[] = [POLLING_CHANNEL_TYPE];
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
