// "Route this app's reactors": the Router view preselected for a started Connect.
import type { SwitchboardBreaker } from "@powerhousedao/reactor-browser/graphql-client";
import type { RoutingOptions } from "@powerhousedao/reactor-router";
import type { HostRulesContext } from "../host-rules/index.js";

/** A switchboard backend's connection, as the host config sets it. */
export type RemoteSettings = {
  readonly requestTimeoutMs?: number;
  readonly breaker?: SwitchboardBreaker;
  readonly realtime?: boolean;
};

/** The Connect's router options, in monitor reactor names. */
export type SeedRouterOptions = Pick<
  RoutingOptions,
  "defaultBackend" | "probeTimeoutMs" | "provisionalRouteMs"
>;

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
  readonly router: SeedRouterOptions;
  /** Monitor reactor of each switchboard to its connection settings. */
  readonly connections: Readonly<Record<string, RemoteSettings>>;
  /** The settings in effect, in words, for "From the host config". */
  readonly settings: readonly string[];
  /** Why a drive can't be created through this router, as in Connect (Q1a). */
  readonly newDrivesBlocked?: string;
};

export type SaveVerdict = { ok: true } | { ok: false; reason: string };
