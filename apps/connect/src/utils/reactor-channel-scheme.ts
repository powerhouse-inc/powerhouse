import {
  ChannelScheme,
  LOCAL_CHANNEL_TYPE,
  type IChannelFactory,
  type ReactorBuilder,
} from "@powerhousedao/reactor";

export type ConnectChannelSchemeOptions = {
  multiReactor: boolean;
  /** Called only when the flag is on. */
  createLocalChannelFactory: () => IChannelFactory;
};

/** Flag off builds the bare CONNECT scheme; on composes the local factory onto it. */
export function configureConnectChannelScheme(
  builder: ReactorBuilder,
  options: ConnectChannelSchemeOptions,
): void {
  builder.withChannelScheme(ChannelScheme.CONNECT);
  if (options.multiReactor) {
    builder.withAdditionalChannelFactory(
      LOCAL_CHANNEL_TYPE,
      options.createLocalChannelFactory(),
    );
  }
}
