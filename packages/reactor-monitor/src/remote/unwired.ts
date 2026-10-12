import type { IEventBus, IReactorClient } from "@powerhousedao/reactor";

// A remote handle serves inspection only, so its client and event bus refuse by name.

function refuse(endpoint: string, what: string, instead: string): never {
  throw new Error(
    `${what} is not wired for the remote reactor at ${endpoint}: provision({kind:"remote"}) attaches a reactor's inspection surfaces only. ${instead}`,
  );
}

/** Refuses every call, naming the path reached (`client.drives.create`). */
export function unwiredRemoteClient(endpoint: string): IReactorClient {
  return makeRefusingProxy(endpoint, "client") as IReactorClient;
}

// Describing the handle (logging, JSON, string coercion) must not throw.
const DESCRIBABLE: ReadonlySet<string> = new Set([
  "toJSON",
  "toString",
  "valueOf",
]);

function makeRefusingProxy(endpoint: string, path: string): unknown {
  const description = `[unwired ${path} of the remote reactor at ${endpoint}]`;
  const target = () =>
    refuse(
      endpoint,
      `Document operation "${path}"`,
      "Document reads and writes against a Switchboard go through a GraphQL reactor client (@powerhousedao/reactor-browser/graphql-client), not through this handle.",
    );
  return new Proxy(target, {
    get: (_target, property) => {
      // Not a thenable, and no symbol protocols: the string fallbacks answer.
      if (property === "then" || typeof property === "symbol") {
        return undefined;
      }
      if (DESCRIBABLE.has(property)) {
        return () => description;
      }
      return makeRefusingProxy(endpoint, `${path}.${String(property)}`);
    },
    apply: () => target(),
  });
}

/** Throws on `subscribe` as the worker bus proxy does for an unforwarded type. */
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
