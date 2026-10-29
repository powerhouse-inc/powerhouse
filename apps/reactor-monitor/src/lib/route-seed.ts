// "Route this app's reactors": the Router view preselected for a started Connect.
import type { HostRulesContext } from "../host-rules/index.js";

export type RouteSeed = {
  /** New per request, so asking again rebuilds the router. */
  readonly id: string;
  /** The Connect member's key, for display. */
  readonly app: string;
  /** The Connect member's envelope path, for the host rules. */
  readonly member: string;
  readonly instanceId: string;
  /** The project host the copy was started from. */
  readonly source: { readonly project: string; readonly host: string };
  readonly context: HostRulesContext;
  /** Monitor reactors, local first, with the host backend each one is. */
  readonly backends: readonly {
    readonly reactor: string;
    readonly backend: string;
  }[];
  /** Router key to monitor reactor, from the host config. */
  readonly collections: Readonly<Record<string, string>>;
  /** Router key to the drive's declared slug. */
  readonly drives: Readonly<Record<string, string>>;
};

export type SaveVerdict = { ok: true } | { ok: false; reason: string };
