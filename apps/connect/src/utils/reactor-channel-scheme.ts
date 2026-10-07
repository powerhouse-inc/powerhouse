import {
  ChannelScheme,
  LOCAL_CHANNEL_TYPE,
  type IChannelFactory,
  type ReactorBuilder,
} from "@powerhousedao/reactor";

/**
 * How Connect configures its in-browser reactor's sync channels, gated on the
 * multi-reactor flag.
 *
 * Flag OFF (the default) builds the bare CONNECT gql scheme exactly as Connect
 * always did: no additional factory, so {@link ReactorBuilder} uses the gql
 * factory bare with no {@link CompositeChannelFactory}, and the reactor's
 * channel factory types are `[gql]`. Flag ON composes a `local` factory onto
 * the scheme so the reactor also routes brokered MessagePort peers, yielding
 * `[gql, local]`.
 */
export type ConnectChannelSchemeOptions = {
  /** The resolved multiReactor flag for this host. */
  multiReactor: boolean;
  /**
   * Builds the local-channel factory to compose onto the gql scheme. Called
   * only when {@link multiReactor} is on, so a flag-off build neither
   * constructs the factory nor touches the composite path.
   */
  createLocalChannelFactory: () => IChannelFactory;
};

/**
 * Applies Connect's CONNECT gql channel scheme to `builder`, composing the
 * local-channel factory onto it only when the multiReactor flag is on.
 *
 * This is the one place the flag decides Connect's sync routing, shared by the
 * main-thread and worker reactor builds so the two cannot drift: flag-off is
 * provably the bare gql scheme on both paths.
 */
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
