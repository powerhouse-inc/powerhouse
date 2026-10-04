import type { ILogger } from "document-model";
import type { ISyncCursorStorage } from "../../storage/interfaces.js";
import type { IChannel, IChannelFactory } from "../interfaces.js";
import type { ChannelConfig } from "../types.js";
import { GqlResponseChannel } from "./gql-res-channel.js";

/**
 * The {@link ChannelConfig.type} a GqlResponseChannel is created from.
 *
 * A response channel is never configured by this reactor: it is registered by
 * the peer that polls it, over the `registerChannel` mutation, whose resolver
 * (`packages/reactor-api`) writes exactly this type. Named here so
 * {@link CompositeChannelFactory} registration for the SWITCHBOARD scheme
 * routes the configs that actually arrive.
 */
export const POLLING_CHANNEL_TYPE = "polling";

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
