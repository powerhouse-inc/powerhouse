import fs from "node:fs";
import {
  assertProtocolConsistency,
  primaryBackend,
  projectReactorToSwitchboard,
  type ReactorConfig,
} from "@powerhousedao/host-core";

/** The env the server would boot with: `env` plus the reactor block's projection where `env` leaves a var unset. */
export function projectedReactorEnv(
  reactor: ReactorConfig | undefined,
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  const projected: Record<string, unknown> =
    projectReactorToSwitchboard(reactor).env;
  const out = { ...env };
  for (const [name, value] of Object.entries(projected)) {
    // A deferred $output token is not a value yet.
    if (out[name] === undefined && typeof value === "string") out[name] = value;
  }
  return out;
}

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
  // A path-storage data dir must exist before the server boots — its own
  // mkdir is not recursive (the ph-win sidecar did this too).
  const storage = primaryBackend(reactor)?.storage;
  if (storage?.kind === "path" && storage.dataDir) {
    // `ph run` resolves `$env` and the `${userData}` sugar before the verb;
    // an unresolved one here would mkdir a literal "${userData}" folder.
    if (/\$\{(userData|projectRoot)\}/.test(storage.dataDir)) {
      throw new Error(
        `${hostFileLabel}: storage.dataDir "${storage.dataDir}" was not resolved; resolve the host (resolveHostOutputs) before starting it.`,
      );
    }
    fs.mkdirSync(storage.dataDir, { recursive: true });
  }
  return options;
}
