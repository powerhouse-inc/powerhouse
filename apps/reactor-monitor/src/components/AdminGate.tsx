import type { ManagedReactor } from "@powerhousedao/reactor-monitor";
import { useState, type FormEvent } from "react";

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

export const STILL_NOT_AN_OPERATOR =
  "The host still does not take this caller as an admin: is the token's address in its ADMINS?";

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

export const NO_PROCESSOR_LEVERS_REASON =
  "this host does not serve inspection-admin to this caller (INSPECTION_ADMIN_ENABLED, ADMINS)";

/** Processor retry and rerun (`reactor.processorLevers`). */
export function processorGateFor(reactor: ManagedReactor): AdminGate {
  if (reactor.processorLevers) {
    return ADMIN_ALLOWED;
  }
  return reactor.kind === "remote"
    ? closed(NO_PROCESSOR_LEVERS_REASON)
    : adminGateFor(reactor);
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

/**
 * The operator gate's note, with a field for a bearer when `onBearer` is
 * given: a remote takes it in place, then re-reads its info.
 */
export function OperatorGateNote({
  gate,
  onBearer,
}: {
  readonly gate: AdminGate;
  /** Resolves once the host's info was re-read with the bearer. */
  readonly onBearer?: (bearer: string) => Promise<void>;
}) {
  const [bearer, setBearer] = useState("");
  const [pending, setPending] = useState(false);
  const [refused, setRefused] = useState(false);

  if (gate.enabled) {
    return null;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!onBearer || !bearer.trim()) {
      return;
    }
    setPending(true);
    setRefused(false);
    await onBearer(bearer);
    // Still mounted, so the gate stayed closed: the host refused the caller.
    setPending(false);
    setRefused(true);
  };

  return (
    <>
      <AdminGateNote gate={gate} />
      {onBearer ? (
        <form
          className="rm-form rm-form-inline"
          data-testid="operator-bearer-form"
          onSubmit={(event) => void submit(event)}
        >
          <label>
            Admin bearer token
            <input
              autoComplete="off"
              className="rm-secret"
              onChange={(event) => setBearer(event.target.value)}
              placeholder="kept for this tab only"
              spellCheck={false}
              type="text"
              value={bearer}
            />
          </label>
          <button disabled={pending || !bearer.trim()} type="submit">
            {pending ? "Checking…" : "Use bearer"}
          </button>
          {refused && !pending ? (
            <p className="rm-error" data-testid="operator-bearer-refused">
              {STILL_NOT_AN_OPERATOR}
            </p>
          ) : null}
        </form>
      ) : null}
    </>
  );
}
