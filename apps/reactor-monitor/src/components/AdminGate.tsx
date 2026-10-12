import type { ManagedReactor } from "@powerhousedao/reactor-monitor";

/** `reason` is shown when `enabled` is false, and empty otherwise. */
export type AdminGate = {
  readonly enabled: boolean;
  readonly reason: string;
};

export const ADMIN_ALLOWED: AdminGate = { enabled: true, reason: "" };

export const READS_ONLY_REASON =
  "this host's inspection subgraph serves reads only";

export const NOT_AN_OPERATOR_REASON =
  "requires an admin caller (ADMINS); add a bearer";

const READS_ONLY: AdminGate = { enabled: false, reason: READS_ONLY_REASON };

function closed(reason: string): AdminGate {
  return { enabled: false, reason };
}

/** State-changing inspection levers (`reactor.admin`). */
export function adminGateFor(reactor: ManagedReactor): AdminGate {
  if (reactor.kind === "remote") {
    return READS_ONLY;
  }
  return reactor.info.access.admin && reactor.admin
    ? ADMIN_ALLOWED
    : closed(
        `${reactor.name} did not report admin access, so its levers are not offered`,
      );
}

/** Raw SQL against the reactor's own store (`reactor.dbQuery`). */
export function sqlGateFor(reactor: ManagedReactor): AdminGate {
  if (reactor.kind === "remote") {
    return READS_ONLY;
  }
  return reactor.info.access.sql && reactor.dbQuery
    ? ADMIN_ALLOWED
    : closed(`${reactor.name} did not report SQL access`);
}

/** Operational reads, which a remote host serves only to an admin caller. */
export function operatorGateFor(reactor: ManagedReactor): AdminGate {
  if (reactor.kind === "remote" && reactor.info.access === null) {
    return closed(NOT_AN_OPERATOR_REASON);
  }
  return ADMIN_ALLOWED;
}

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
