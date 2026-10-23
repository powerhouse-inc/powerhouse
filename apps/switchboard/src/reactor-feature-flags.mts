import type { ReactorFeatureFlags } from "@powerhousedao/reactor";

export type ResolvedReactorFeatureFlags = {
  flags: Partial<ReactorFeatureFlags>;
  /** Names of the flags set to true, enforcement flags in prerequisite order. */
  enabled: string[];
};

/**
 * Feature flags from the REACTOR_* env vars. Each enforcement flag requires the
 * ones before it and is on only at the literal "true"; undoV3 has no
 * prerequisites and is off only at the literal "false". The reactor rejects an
 * inconsistent set rather than enforcing less than the operator asked for, so
 * this reports what was asked without correcting it.
 */
export function resolveReactorFeatureFlags(
  env: NodeJS.ProcessEnv,
): ResolvedReactorFeatureFlags {
  const flags: Partial<ReactorFeatureFlags> = {
    documentDecisions: env.REACTOR_DOCUMENT_DECISIONS === "true",
    authEnforcement: env.REACTOR_AUTH_ENFORCEMENT === "true",
    authGroups: env.REACTOR_AUTH_GROUPS === "true",
    authConditions: env.REACTOR_AUTH_CONDITIONS === "true",
    undoV3: env.REACTOR_UNDO_V3 !== "false",
  };

  const enabled = Object.entries(flags)
    .filter(([, isEnabled]) => isEnabled)
    .map(([name]) => name);

  return { flags, enabled };
}
