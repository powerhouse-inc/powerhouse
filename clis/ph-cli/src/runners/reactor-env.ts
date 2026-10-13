import {
  assertProtocolConsistency,
  projectReactorToSwitchboard,
  type ReactorConfig,
} from "@powerhousedao/host-core";

/**
 * Apply a host's reactor block to the CURRENT process env, the way the
 * in-process switchboard server reads it at boot (D2.c: env derivation
 * immediately before the member starts; sequential boots make this safe).
 * Single-sourcing teeth first: a pre-set env contradicting the protocol block
 * fails loudly. Then set-if-absent, so an operator's explicit (agreeing) env
 * still wins during the transition. Returns the non-env options (dbPath).
 *
 * Lives OUTSIDE the runner modules on purpose: every export of a runner
 * module reads as a dispatchable verb, and this is not one.
 */
export function applyReactorEnvProjection(
  reactor: ReactorConfig | undefined,
  hostFileLabel: string,
): { dbPath?: string } {
  const { env, options } = projectReactorToSwitchboard(reactor);
  assertProtocolConsistency(reactor?.protocol, process.env, hostFileLabel);
  for (const [name, value] of Object.entries(env)) {
    if (process.env[name] === undefined) process.env[name] = value;
  }
  return options;
}
