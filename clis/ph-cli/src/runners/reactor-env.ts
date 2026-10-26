import fs from "node:fs";
import {
  assertProtocolConsistency,
  primaryBackend,
  projectReactorToSwitchboard,
  type ReactorConfig,
} from "@powerhousedao/host-core";

/** The reactor block as the switchboard boots with it: the vars `env` leaves unset, and dbPath. */
export function switchboardBootProjection(
  reactor: ReactorConfig | undefined,
  env: Readonly<Record<string, string | undefined>>,
): { env: Record<string, string>; dbPath?: string } {
  const { env: projected, options } = projectReactorToSwitchboard(reactor);
  const unset: Record<string, string> = {};
  for (const [name, value] of Object.entries(projected) as [
    string,
    unknown,
  ][]) {
    // A deferred $output token is not a value yet.
    if (env[name] === undefined && typeof value === "string")
      unset[name] = value;
  }
  return {
    env: unset,
    ...(options.dbPath !== undefined ? { dbPath: options.dbPath } : {}),
  };
}

/** The verb owns dev mode; `runner.dev` is the host-file spelling of it. */
export function switchboardDevMode(
  devVerb: boolean,
  runner: { dev?: boolean },
): boolean {
  return devVerb || runner.dev === true;
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
  assertProtocolConsistency(reactor?.protocol, process.env, hostFileLabel);
  const projection = switchboardBootProjection(reactor, process.env);
  Object.assign(process.env, projection.env);
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
  return projection.dbPath !== undefined ? { dbPath: projection.dbPath } : {};
}
