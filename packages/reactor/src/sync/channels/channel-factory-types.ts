import type { IChannelFactory } from "../interfaces.js";

/** The channel types a built factory declares; empty when it declares none. */
export function channelFactoryTypes(
  factory: IChannelFactory,
): readonly string[] {
  return factory.channelTypes ?? [];
}
