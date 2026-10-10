import type { ManagedReactor } from "@powerhousedao/reactor-monitor";
import { useCallback, useEffect, useState } from "react";

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
 * to be refused teaches the operator nothing about WHY, and the reactor
 * reported the facts before the click.
 *
 * Those facts are re-read rather than trusted forever; see
 * {@link useServerTierGates}.
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
    reason: `The reactor at ${reactor.endpoint} serves inspection READS only: its host has not set PH_INSPECTION_ADMIN=true, so pause/resume, processor retries, catch-up sweeps, integrity rebuilds and every sync repair lever are refused there. Restart that host with the flag and the levers go live here -- "Re-check server" on the Overview tab asks it again without waiting.`,
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
    reason: `The reactor at ${reactor.endpoint} does not serve raw SQL against its store. That is its own opt-in tier (PH_INSPECTION_SQL=true, on top of PH_INSPECTION_ADMIN=true): a host that turned on the operator levers has not thereby agreed to expose its database. Restart that host with both flags and use "Re-check server" on the Overview tab.`,
  };
}

/**
 * How often the reported tiers are re-read off the handle.
 *
 * A read of `reactor.serverInfo`, not a request: that property is live, and the
 * inspection client re-fetches on its own refusal paths (a lever the far side
 * answered FORBIDDEN, a local "no" that might be stale). This poll is what
 * turns such a refresh into a re-render, so a gate cannot sit open on facts the
 * client already knows are wrong. The client's own TTL decides how often the
 * network is actually touched.
 */
export const SERVER_TIER_POLL_MS = 2000;

/** The gates for one reactor, plus the operator's explicit re-check. */
export type ServerTierGates = {
  readonly admin: AdminGate;
  readonly sql: AdminGate;
  /** Re-reads the far side's reported facts now. Inert for a local reactor. */
  readonly recheck: () => void;
  readonly rechecking: boolean;
  /** Why the last re-check failed; empty when it did not. */
  readonly recheckError: string;
};

type ReportedTiers = { readonly admin: boolean; readonly sql: boolean };

function reportedTiers(reactor: ManagedReactor): ReportedTiers {
  if (reactor.kind !== "remote") {
    return { admin: true, sql: true };
  }
  return {
    admin: reactor.serverInfo.adminEnabled,
    sql: reactor.serverInfo.sqlEnabled,
  };
}

/**
 * The admin and SQL gates for `reactor`, kept current with what the far side
 * now reports.
 *
 * The flow this exists for is the documented one: an operator restarts a
 * Switchboard with `PH_INSPECTION_ADMIN=true` and expects the levers to go
 * live, or restarts it without and expects them to close. Gates computed once
 * at provision time dead-end that in both directions -- which is what the
 * first cut of W3.2 did -- so the tiers are polled off the handle's live
 * `serverInfo` and {@link ServerTierGates.recheck} forces a fresh read for an
 * operator who does not want to wait for a TTL.
 *
 * Keyed per reactor by the caller, so the state belongs to one handle.
 */
export function useServerTierGates(reactor: ManagedReactor): ServerTierGates {
  // Held only to drive a render: the gates below are read from the handle's
  // live `serverInfo`, so a CHANGE in the reported tiers has to become new
  // state for React to recompute them.
  const [, setTiers] = useState<ReportedTiers>(() => reportedTiers(reactor));
  const [rechecking, setRechecking] = useState(false);
  const [recheckError, setRecheckError] = useState("");

  useEffect(() => {
    if (reactor.kind !== "remote") {
      return () => {};
    }
    const interval = setInterval(() => {
      setTiers((previous) => {
        const next = reportedTiers(reactor);
        return previous.admin === next.admin && previous.sql === next.sql
          ? previous
          : next;
      });
    }, SERVER_TIER_POLL_MS);
    return () => clearInterval(interval);
  }, [reactor]);

  const recheck = useCallback(() => {
    if (reactor.kind !== "remote") {
      return;
    }
    setRechecking(true);
    setRecheckError("");
    reactor
      .refreshServerInfo()
      .then((info) =>
        setTiers({ admin: info.adminEnabled, sql: info.sqlEnabled }),
      )
      .catch((error: unknown) =>
        setRecheckError(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => setRechecking(false));
  }, [reactor]);

  return {
    admin: adminGateFor(reactor),
    sql: sqlGateFor(reactor),
    recheck,
    rechecking,
    recheckError,
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
