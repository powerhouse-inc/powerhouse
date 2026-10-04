import type { ManagedReactor } from "@powerhousedao/reactor-monitor";

/**
 * Whether this reactor's state-changing inspection ops are available here, and
 * why not when they are not.
 *
 * Exists because a REMOTE reactor's operator levers are the remote host's to
 * grant: reactor-api serves them only under an explicit opt-in, and raw SQL
 * under a second one. A locally hosted reactor is this process's own, so
 * everything is available -- which is why {@link ADMIN_ALLOWED} is the default
 * and no local tab has to think about this.
 *
 * Disabled rather than merely failing: a button that reaches the far side only
 * to be refused teaches the operator nothing about WHY, and the facts are
 * known before the click (the remote reactor reported them at provision time).
 */
export type AdminGate = {
  readonly enabled: boolean;
  /** Shown to the operator when `enabled` is false. Empty when it is true. */
  readonly reason: string;
};

export const ADMIN_ALLOWED: AdminGate = { enabled: true, reason: "" };

/** Whether `reactor` serves its state-changing inspection ops to this monitor. */
export function adminGateFor(reactor: ManagedReactor): AdminGate {
  if (reactor.kind !== "remote") {
    return ADMIN_ALLOWED;
  }
  if (reactor.serverInfo.adminEnabled) {
    return ADMIN_ALLOWED;
  }
  return {
    enabled: false,
    reason: `The reactor at ${reactor.endpoint} serves inspection READS only: its host has not set PH_INSPECTION_ADMIN=true, so pause/resume, processor retries, catch-up sweeps, integrity rebuilds and every sync repair lever are refused there.`,
  };
}

/** Whether `reactor` serves raw SQL against its own store to this monitor. */
export function sqlGateFor(reactor: ManagedReactor): AdminGate {
  if (reactor.kind !== "remote") {
    return ADMIN_ALLOWED;
  }
  if (reactor.serverInfo.sqlEnabled) {
    return ADMIN_ALLOWED;
  }
  return {
    enabled: false,
    reason: `The reactor at ${reactor.endpoint} does not serve raw SQL against its store. That is its own opt-in tier (PH_INSPECTION_SQL=true, on top of PH_INSPECTION_ADMIN=true): a host that turned on the operator levers has not thereby agreed to expose its database.`,
  };
}

/** The one-line explanation shown wherever a gate is closed. */
export function AdminGateNote({ gate }: { readonly gate: AdminGate }) {
  if (gate.enabled) {
    return null;
  }
  return (
    <p className="rm-note" data-testid="admin-gate-note">
      {gate.reason}
    </p>
  );
}
