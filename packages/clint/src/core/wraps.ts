import type { LifecycleHandle, WrapRegistry } from "./types.js";

/**
 * The identity registry — every wrap is a passthrough.
 *
 * `agentStream` returns `inner` directly (not a wrapping async generator) so
 * the no-instrumentation path adds zero generator frames per yield. The
 * other wraps reduce to immediate `inner()` calls which V8 inlines.
 */
export const IDENTITY_WRAPS: WrapRegistry = {
  command: (_id, inner) => inner(),
  agentStream: (inner) => inner,
  tool: (_name, tool) => tool,
  routineIteration: (_attrs, inner) => inner(),
};

/**
 * Compose two registries left-to-right: the result invokes `a`'s wrap first
 * (outer), then `b`'s wrap (inner). For the identity element, this is a
 * no-op.
 *
 * Composition semantics by wrap shape:
 * - `command` / `routineIteration` (invoke-around): `b` runs inside `a`'s body.
 * - `agentStream` / `tool` (decorate-and-return): `b` decorates the result of `a`.
 */
function mergeWraps(a: WrapRegistry, b: Partial<WrapRegistry>): WrapRegistry {
  return {
    command: b.command
      ? (id, inner) => a.command(id, () => b.command!(id, inner))
      : a.command,
    agentStream: b.agentStream
      ? (inner, attrs) => b.agentStream!(a.agentStream(inner, attrs), attrs)
      : a.agentStream,
    tool: b.tool ? (name, tool) => b.tool!(name, a.tool(name, tool)) : a.tool,
    routineIteration: b.routineIteration
      ? (attrs, inner) =>
          a.routineIteration(attrs, () => b.routineIteration!(attrs, inner))
      : a.routineIteration,
  };
}

/**
 * Fold a list of LifecycleHandle contributions into a single WrapRegistry,
 * starting from IDENTITY_WRAPS.
 *
 * Empty input (no lifecycle hooks registered, or every hook returned no
 * contributions) yields IDENTITY_WRAPS — core's call sites are unconditional.
 */
export function composeWraps(handles: LifecycleHandle[]): WrapRegistry {
  return handles
    .map((h) => h.contribute ?? {})
    .reduce(mergeWraps, IDENTITY_WRAPS);
}
