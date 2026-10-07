import type { IChannelFactory } from "../interfaces.js";
import { CompositeChannelFactory } from "./composite-channel-factory.js";
import {
  GQL_CHANNEL_TYPE,
  GqlRequestChannelFactory,
} from "./gql-request-channel-factory.js";
import {
  GqlResponseChannelFactory,
  POLLING_CHANNEL_TYPE,
} from "./gql-response-channel-factory.js";
import {
  LOCAL_CHANNEL_TYPE,
  LocalChannelFactory,
} from "./local-channel-factory.js";

/**
 * The {@link ChannelConfig.type}s a BUILT factory actually routes.
 *
 * Read off the live object a reactor was built with, never re-derived from the
 * configuration that asked for it: the two can disagree (a `withChannelScheme`
 * plus `withAdditionalChannelFactory` reactor serves a type its scheme alone
 * does not, and a caller-supplied `SyncBuilder` factory has no representation
 * in any scheme at all), and the routing is what a remote is actually accepted
 * or refused on. A host reporting what its reactor can form a remote on -- the
 * monitor's capability contract, for one -- must read this.
 *
 * A {@link CompositeChannelFactory} answers for itself; the three factories
 * this package ships answer with the single type each serves. Anything else is
 * an implementation this package cannot classify, and the answer is the
 * conservative empty list rather than a guess: a caller that would expose an
 * adopt path on a claimed type must not get one from an assumption.
 */
export function channelFactoryTypes(
  factory: IChannelFactory,
): readonly string[] {
  if (factory instanceof CompositeChannelFactory) {
    return factory.registeredTypes();
  }
  if (factory instanceof GqlRequestChannelFactory) {
    return [GQL_CHANNEL_TYPE];
  }
  if (factory instanceof GqlResponseChannelFactory) {
    return [POLLING_CHANNEL_TYPE];
  }
  if (factory instanceof LocalChannelFactory) {
    return [LOCAL_CHANNEL_TYPE];
  }
  return [];
}
