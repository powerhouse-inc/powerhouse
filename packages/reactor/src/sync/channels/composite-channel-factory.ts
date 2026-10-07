import type {
  DriveCollectionId,
  IOperationIndex,
} from "../../cache/operation-index-types.js";
import type { ISyncCursorStorage } from "../../storage/interfaces.js";
import type { IChannel, IChannelFactory } from "../interfaces.js";
import type { ChannelConfig, RemoteFilter, RemoteOptions } from "../types.js";

/**
 * An {@link IChannelFactory} that dispatches to one of several factories on
 * {@link ChannelConfig.type}.
 *
 * This is the seam that lets ONE reactor hold remotes of more than one
 * transport at once -- gql remotes to a Switchboard AND brokered
 * `LocalChannel` peers (multi-reactor W3.0). Before it, a reactor wired a
 * single factory, so a local-sync reactor was local-only and a gql reactor
 * could not adopt a local peer; every mixed topology was out of reach.
 *
 * Routing is strict and total: a config whose type no registered factory
 * claims is refused by name rather than handed to whichever factory happens to
 * be first. That refusal is the point -- the single-factory world answered a
 * `{ type: "local" }` config on a gql reactor with a complaint about a missing
 * `url`, which says nothing about what is actually wrong.
 *
 * The composite adds no behaviour of its own: it holds no queue, no transport
 * and no logger, and every argument is passed through untouched. Which types a
 * reactor registers is the builder's decision (`ReactorBuilder`), not this
 * class's.
 */
export class CompositeChannelFactory implements IChannelFactory {
  private readonly factories: Map<string, IChannelFactory>;

  /**
   * @param factories - (channel-config type -> factory) pairs. A duplicated
   *   type is refused rather than silently resolved to the last entry: two
   *   factories claiming one type is a configuration mistake with no correct
   *   answer.
   * @throws Error if `factories` is empty or names a type twice
   */
  constructor(factories: Iterable<readonly [string, IChannelFactory]>) {
    this.factories = new Map<string, IChannelFactory>();
    for (const [type, factory] of factories) {
      if (this.factories.has(type)) {
        throw new Error(
          `CompositeChannelFactory was given two factories for the channel type "${type}"`,
        );
      }
      if (factory.channelTypes && !factory.channelTypes.includes(type)) {
        throw new Error(
          `CompositeChannelFactory was given a factory for "${type}" that builds only [${factory.channelTypes.join(", ")}]`,
        );
      }
      this.factories.set(type, factory);
    }
    if (this.factories.size === 0) {
      throw new Error(
        "CompositeChannelFactory requires at least one (type, factory) entry",
      );
    }
  }

  /**
   * Creates a channel with the factory registered for `config.type`.
   *
   * @throws Error if no factory is registered for that type
   */
  instance(
    remoteId: string,
    remoteName: string,
    config: ChannelConfig,
    cursorStorage: ISyncCursorStorage,
    collectionId: DriveCollectionId,
    filter: RemoteFilter,
    operationIndex: IOperationIndex,
    options?: RemoteOptions,
  ): IChannel {
    const factory = this.factories.get(config.type);
    if (!factory) {
      throw new Error(
        `This reactor has no "${config.type}" channel factory: it composes factories for [${this.channelTypes.join(", ")}]`,
      );
    }
    return factory.instance(
      remoteId,
      remoteName,
      config,
      cursorStorage,
      collectionId,
      filter,
      operationIndex,
      options,
    );
  }

  /** The types it routes, in registration order. */
  get channelTypes(): readonly string[] {
    return [...this.factories.keys()];
  }
}
