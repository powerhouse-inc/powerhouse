import type { ReactorFeatureFlags } from "@powerhousedao/reactor";

export type ResolvedReactorFeatureFlags = {
  flags: Partial<ReactorFeatureFlags>;
  /** Names of the flags set to true, in prerequisite order. */
  enabled: string[];
};

/**
 * Enforcement flags from the REACTOR_* env vars. Each flag requires the ones
 * before it; the reactor rejects an inconsistent set rather than enforcing less
 * than the operator asked for, so this reports what was asked without
 * correcting it.
 */
export function resolveReactorFeatureFlags(
  env: NodeJS.ProcessEnv,
): ResolvedReactorFeatureFlags {
  return reactorFeatureFlagsOf({
    documentDecisions: env.REACTOR_DOCUMENT_DECISIONS === "true",
    authEnforcement: env.REACTOR_AUTH_ENFORCEMENT === "true",
    authGroups: env.REACTOR_AUTH_GROUPS === "true",
    authConditions: env.REACTOR_AUTH_CONDITIONS === "true",
  });
}

/** The flags as configured, with the names of those set to true. */
export function reactorFeatureFlagsOf(
  flags: Partial<ReactorFeatureFlags>,
): ResolvedReactorFeatureFlags {
  const enabled = Object.entries(flags)
    .filter(([, isEnabled]) => isEnabled)
    .map(([name]) => name);

  return { flags, enabled };
}
