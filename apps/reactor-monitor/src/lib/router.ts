/**
 * Constructs a {@link RoutingReactorClient} over a set of monitor-managed
 * reactors (multi-reactor router, stages 1-3 — see
 * docs/plans/2026-10-03-multi-reactor.md, "Router client").
 *
 * The client is built HERE, in the app, rather than in
 * `@powerhousedao/reactor-monitor`: a routing topology is an app-level concern,
 * and `reactor-router` already depends on `reactor-monitor` for the capability
 * contract -- making the monitor library construct a router would invert that
 * dependency. The monitor library stays router-agnostic; the one place the two
 * meet is here, where a `ManagedReactor` handle is handed to the router as a
 * backend.
 *
 * A `ManagedReactor` IS a {@link ReactorBackend} structurally (name + client +
 * capabilities), proved by reactor-router's own `backend-contract.test.ts`. The
 * only adaptation this helper makes is wrapping each handle's client in
 * {@link withOwnershipGuard}: no reactor validates drive ownership on its own
 * today, so without the guard a write aimed at the wrong backend would fail
 * with an unstructured not-found rather than a structured
 * {@link WrongBackendError} the router can recover from. The guard is the
 * backend half of advisory routing (plan agreed decision 4), and wiring it here
 * is what makes the override -> corrected recovery story actually fire.
 */
import {
  RoutingReactorClient,
  withOwnershipGuard,
  type ReactorBackend,
  type RoutingOptions,
} from "@powerhousedao/reactor-router";
import type { ManagedReactor } from "@powerhousedao/reactor-monitor";

/** A managed reactor handle wrapped as an ownership-validating router backend. */
export function guardedBackend(reactor: ManagedReactor): ReactorBackend {
  return {
    name: reactor.name,
    capabilities: reactor.capabilities,
    client: withOwnershipGuard(reactor.client, { backendName: reactor.name }),
  };
}

/**
 * Builds one routing client over the given handles. The handles are wrapped
 * with {@link guardedBackend} in the order supplied; configuration order is the
 * router's stable order, and the first backend is its primary unless
 * `options.primaryBackend` says otherwise.
 */
export function buildRoutingClient(
  reactors: readonly ManagedReactor[],
  options: RoutingOptions = {},
): RoutingReactorClient {
  return new RoutingReactorClient(reactors.map(guardedBackend), options);
}
