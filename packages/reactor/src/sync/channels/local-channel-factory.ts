import type { ILogger } from "document-model";
import type {
  DriveCollectionId,
  IOperationIndex,
} from "../../cache/operation-index-types.js";
import type { ISyncCursorStorage } from "../../storage/interfaces.js";
import type { IChannel, IChannelFactory } from "../interfaces.js";
import type { ChannelConfig, RemoteFilter, RemoteOptions } from "../types.js";
import { LocalChannel } from "./local-channel.js";
import type { LocalChannelTransportProvider } from "./local-channel-transport.js";

/** The {@link ChannelConfig.type} a LocalChannel is created from. */
export const LOCAL_CHANNEL_TYPE = "local";

/**
 * Factory for {@link LocalChannel} instances.
 *
 * The channel's config is `{ type: "local", parameters: { peerId, channelName } }`
 * -- no url, because there is no server. The factory does not take a port
 * directly: {@link IChannelFactory.instance} has no seam for a live object, and
 * a MessagePort is not clone-safe config that could ride in `parameters`.
 * Instead the factory holds a {@link LocalChannelTransportProvider} and resolves
 * the port from the (peerId, channelName) the config names. W1.2 supplies a real
 * brokered MessagePort by registering it with the provider under that key, with
 * no change to the channel or this factory.
 */
export class LocalChannelFactory implements IChannelFactory {
  private readonly logger: ILogger;
  private readonly transportProvider: LocalChannelTransportProvider;

  constructor(
    logger: ILogger,
    transportProvider: LocalChannelTransportProvider,
  ) {
    this.logger = logger;
    this.transportProvider = transportProvider;
  }

  instance(
    remoteId: string,
    remoteName: string,
    config: ChannelConfig,
    cursorStorage: ISyncCursorStorage,
    collectionId: DriveCollectionId,
    filter: RemoteFilter,
    _operationIndex: IOperationIndex,
    _options?: RemoteOptions,
  ): IChannel {
    const peerId = config.parameters.peerId;
    if (typeof peerId !== "string" || !peerId) {
      throw new Error(
        'LocalChannelFactory requires a non-empty "peerId" string in config.parameters',
      );
    }
    const channelName = config.parameters.channelName;
    if (typeof channelName !== "string" || !channelName) {
      throw new Error(
        'LocalChannelFactory requires a non-empty "channelName" string in config.parameters',
      );
    }

    const port = this.transportProvider(peerId, channelName);
    if (!port) {
      throw new Error(
        `LocalChannelFactory has no transport for peer '${peerId}' channel '${channelName}'`,
      );
    }

    return new LocalChannel(
      this.logger,
      remoteId,
      remoteName,
      cursorStorage,
      port,
      collectionId,
      filter,
    );
  }
}
