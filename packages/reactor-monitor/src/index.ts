/**
 * Placeholder typed API surface for the reactor-monitor library (W0.1 of the
 * multi-reactor initiative — see docs/plans/2026-10-03-multi-reactor.md).
 *
 * Provisioning (worker | in-process kinds) lands in W0.2, remote in W3.1.
 * This module only pins the shape so `apps/reactor-monitor` has a real,
 * typed import to build against before that work starts.
 */

/** Bump when the shape of this module's exports changes in a breaking way. */
export const ReactorMonitorVersion = "0.1.0" as const;

/**
 * How a monitored reactor is hosted. `kind` is the discriminant other code
 * should switch on as more hosting strategies (and their config) are added.
 */
export interface ReactorDescriptor {
  kind: "worker" | "in-process" | "remote";
  /** Human-readable label shown in the monitor UI's reactor list. */
  name: string;
}

/** A reactor the monitor has provisioned and can inspect. */
export interface ManagedReactor {
  kind: "worker" | "in-process" | "remote";
  name: string;
  /** Opaque id the monitor uses to address this reactor in inspector ops. */
  id: string;
}

/**
 * Provisions a reactor matching `descriptor`.
 *
 * Not implemented yet: hosting (worker | in-process) lands in W0.2 and
 * remote in W3.1. Always rejects until then.
 */
export function provision(
  descriptor: ReactorDescriptor,
): Promise<ManagedReactor> {
  return Promise.reject(
    new Error(
      `NotImplemented: provision() for reactor kind "${descriptor.kind}" lands in W0.2 (worker/in-process) or W3.1 (remote)`,
    ),
  );
}
