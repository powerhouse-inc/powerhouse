import type { IEventBus, IReactorClient } from "@powerhousedao/reactor";

/**
 * The two handle fields a REMOTE reactor cannot honour, and the one honest way
 * to present them: refuse by name.
 *
 * `ManagedReactorBase` requires a `client` and an `events` bus because every
 * locally hosted reactor has both. A remote reactor's are on the far side of
 * HTTP, and W3.2 serves its INSPECTION surfaces, not its document plane or its
 * event bus. The alternatives were both worse: widening the handle type would
 * force every existing consumer to branch on hosting kind, and a silently inert
 * stub (a client that resolves nothing, a bus that never fires) is exactly the
 * kind of thing that reads green while nothing works -- the failure mode this
 * whole initiative exists to stamp out.
 *
 * So these throw, and the message says what is missing and what to use
 * instead. A monitor view that must not hit them gates on
 * `capabilities.hosting === "remote"`.
 */

function refuse(endpoint: string, what: string, instead: string): never {
  throw new Error(
    `${what} is not wired for the remote reactor at ${endpoint}: provision({kind:"remote"}) attaches a reactor's INSPECTION surfaces only (multi-reactor W3.2). ${instead}`,
  );
}

/**
 * An `IReactorClient` that refuses every call, naming the path that was
 * reached (`client.drives.create`, not just "client").
 *
 * A proxy rather than twenty throwing methods: `IReactorClient` has nested
 * namespaces (`drives`, `relationships`, `jobs`) and gains members over time,
 * and a hand-written stub that falls behind the interface would start
 * returning `undefined` instead of refusing.
 */
export function unwiredRemoteClient(endpoint: string): IReactorClient {
  return makeRefusingProxy(endpoint, "client") as IReactorClient;
}

function makeRefusingProxy(endpoint: string, path: string): unknown {
  const target = () =>
    refuse(
      endpoint,
      `Document operation "${path}"`,
      "Document reads and writes against a Switchboard go through a GraphQL reactor client (@powerhousedao/reactor-browser/graphql-client), not through this handle.",
    );
  return new Proxy(target, {
    get: (_target, property) => {
      // Never pretend to be a thenable: awaiting the handle (or any field of
      // it) must not call into this.
      if (property === "then" || typeof property === "symbol") {
        return undefined;
      }
      return makeRefusingProxy(endpoint, `${path}.${String(property)}`);
    },
    apply: () => target(),
  });
}

/**
 * An `IEventBus` that refuses both halves.
 *
 * The remote reactor's bus events are not forwarded over the inspection
 * surface -- it is a request/response GraphQL plane, with no stream -- so a
 * subscriber would wait forever. It throws synchronously on `subscribe`, which
 * is what the worker-hosted bus proxy does for an event type it does not
 * forward, so a caller meets the same failure in the same place.
 */
export function unwiredRemoteEventBus(endpoint: string): IEventBus {
  return {
    subscribe: () =>
      refuse(
        endpoint,
        "The reactor event bus",
        "The inspection surface is request/response: poll the inspection reads instead (the monitor's Events tab is unavailable for a remote reactor).",
      ),
    emit: () =>
      refuse(
        endpoint,
        "Emitting onto the reactor event bus",
        "Nothing on this side may inject events into a remote reactor.",
      ),
  };
}
